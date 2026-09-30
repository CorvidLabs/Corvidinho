/**
 * SAFE-8 / SAFE-15 (#98) — the `spend_alerts` table: when the 80% warning is armed,
 * which warnings still have to reach the owner, and when the owner was last
 * pinged about the cap.
 *
 * Recording and delivery are separate. Whatever process makes the provider
 * call (a bridge-spawned run, WATCH, the daemon, a delegate worker, the CLI)
 * records a `warn` row when a settled call takes rolling 24 h spend to 80% of
 * a cap (the total, or that call's provider cap). The row stays undelivered until the Discord bridge — the only
 * surface that knows the owner — claims it and DMs the owner (SAFE-14.a;
 * src/agent/spend-outbox.ts, src/discord/spend-dm.ts). A warning is never used up by a run whose
 * surface could not show it, nor by a post made while spend is back under 80%
 * (it stays pending, still disarming its crossing, until a post sees 80%
 * again or it is 24 h old).
 *
 * Kinds (constants; the only text column is the scrubbed `scope`, SAFE-6):
 *  - `warn`  80% reached while the warning was armed (disarms it).
 *  - `rearm` spend seen back under SPEND_REARM_PERCENT while something was
 *            disarmed; re-arms both the warning and the cap ping.
 *  - `cap`   the bridge pinged the owner about a spend-cap stop (disarms the
 *            ping for the rest of the cap episode).
 *
 * Every row carries the cap scope (SAFE-14: `total` for
 * CORVIDINHO_DAILY_SPEND_CAP_USD, `provider:<id>` for one entry of
 * CORVIDINHO_PROVIDER_SPEND_CAPS_USD; written through scrubSecrets, SAFE-6)
 * and the cap value it applies to, and all state is kept per (scope, cap
 * value), so each cap warns at 80% and pings about a stop once per crossing
 * (SAFE-15). The warning for a cap is armed unless a `warn` row for that
 * scope and value is newer than the last `rearm` for them and less than 24 h
 * old; the cap ping likewise with `cap` rows. A new cap value is armed. The gap between 80% and the re-arm level keeps spend that
 * hovers around 80% (old calls leaving the window, new ones arriving) from
 * warning on every call. Callers run these inside their own IMMEDIATE
 * transaction so concurrent processes see one consistent state.
 */

import type { Database } from "bun:sqlite";
import { scrubSecrets } from "../store/scrub.ts";
import {
  atWarnThreshold,
  SPEND_REARM_PERCENT,
  spendPercent,
  TOTAL_SPEND_SCOPE,
} from "./spend-notice.ts";
import type { SpendWarning } from "./types.ts";

/** Same rolling window as the ledger (kept here to avoid an import cycle). */
const WINDOW_MS = 24 * 60 * 60 * 1000;

export const SPEND_ALERT_WARN = "warn";
export const SPEND_ALERT_REARM = "rearm";
export const SPEND_ALERT_CAP = "cap";

const SPEND_ALERTS_SQL = `
CREATE TABLE IF NOT EXISTS spend_alerts (
  id TEXT PRIMARY KEY NOT NULL,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  cap_micro_usd INTEGER NOT NULL,
  spent_micro_usd INTEGER NOT NULL,
  delivered_at INTEGER,
  scope TEXT NOT NULL DEFAULT 'total'
);
CREATE INDEX IF NOT EXISTS idx_spend_alerts_ts ON spend_alerts(ts);
`;

/**
 * Create `spend_alerts` (idempotent; adds `delivered_at` and, SAFE-14, the
 * `scope` column to an older table — its rows are the total cap's). No
 * schema version bump: the table is module-owned.
 */
export function ensureSpendAlerts(db: Database): void {
  db.exec(SPEND_ALERTS_SQL);
  const cols = spendAlertColumns(db);
  if (!cols.has("delivered_at")) addSpendAlertColumn(db, "delivered_at", "delivered_at INTEGER");
  if (!cols.has("scope")) {
    addSpendAlertColumn(db, "scope", `scope TEXT NOT NULL DEFAULT '${TOTAL_SPEND_SCOPE}'`);
  }
}

function spendAlertColumns(db: Database): Set<string> {
  const cols = db.query("PRAGMA table_info(spend_alerts)").all() as Array<{ name: string }>;
  return new Set(cols.map((c) => c.name));
}

/**
 * ALTER one column in. Processes sharing the DB (parallel council voices
 * right after an update) can each see it missing; the one that loses the race
 * gets "duplicate column name", which is fine once the column is there — the
 * spend check must not stop that call over it (fail closed only when the
 * column is really missing).
 */
function addSpendAlertColumn(db: Database, name: string, ddl: string): void {
  try {
    db.exec(`ALTER TABLE spend_alerts ADD COLUMN ${ddl}`);
  } catch (err) {
    if (!spendAlertColumns(db).has(name)) throw err;
  }
}

/** The stored form of a scope (scrubbed like every free-text column, SAFE-6). */
function scopeKey(scope: string | undefined): string {
  return scrubSecrets(scope ?? TOTAL_SPEND_SCOPE);
}

/** True when `spend_alerts` exists (read paths never create it). */
export function spendAlertsExist(db: Database): boolean {
  return Boolean(
    db
      .query("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'spend_alerts'")
      .get(),
  );
}

/** Spend is back under the re-arm level (a zero cap never re-arms). */
export function belowRearmLevel(spentMicroUsd: number, capMicroUsd: number): boolean {
  return capMicroUsd > 0 && spentMicroUsd * 100 < capMicroUsd * SPEND_REARM_PERCENT;
}

function maxRowid(db: Database, where: string, params: Array<string | number>): number {
  const row = db
    .query(`SELECT COALESCE(MAX(rowid), 0) AS id FROM spend_alerts WHERE ${where}`)
    .get(...params) as { id: number };
  return row.id;
}

function lastRearm(db: Database, capMicroUsd: number, scope: string): number {
  return maxRowid(db, "kind = ? AND cap_micro_usd = ? AND scope = ?", [
    SPEND_ALERT_REARM,
    capMicroUsd,
    scope,
  ]);
}

function insertAlert(
  db: Database,
  a: {
    kind: string;
    now: number;
    capMicroUsd: number;
    spentMicroUsd: number;
    deliveredAt?: number;
    scope?: string;
  },
): string {
  const id = crypto.randomUUID();
  db.run(
    `INSERT INTO spend_alerts (id, ts, kind, cap_micro_usd, spent_micro_usd, delivered_at, scope)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, a.now, a.kind, a.capMicroUsd, a.spentMicroUsd, a.deliveredAt ?? null, scopeKey(a.scope)],
  );
  return id;
}

/**
 * Armed unless a `kind` row for this scope and cap value is newer than its
 * last re-arm and < 24 h old.
 */
function armed(db: Database, kind: string, capMicroUsd: number, now: number, scope?: string): boolean {
  const key = scopeKey(scope);
  const last = maxRowid(db, "kind = ? AND cap_micro_usd = ? AND scope = ? AND ts > ?", [
    kind,
    capMicroUsd,
    key,
    now - WINDOW_MS,
  ]);
  return last === 0 || lastRearm(db, capMicroUsd, key) > last;
}

/** The 80% warning for this cap (scope and value; default the total cap) may fire (see module doc). */
export function warnArmed(db: Database, capMicroUsd: number, now: number, scope?: string): boolean {
  return armed(db, SPEND_ALERT_WARN, capMicroUsd, now, scope);
}

/** The owner may be pinged about a stop at this cap (scope and value; default the total cap). */
export function capPingArmed(db: Database, capMicroUsd: number, now: number, scope?: string): boolean {
  return armed(db, SPEND_ALERT_CAP, capMicroUsd, now, scope);
}

/**
 * Record a `rearm` row for this cap (scope and value) when spend is under its
 * re-arm level and a recent `warn` or `cap` row for it is still in force. Per
 * scope and cap value, so a process with a much larger cap never re-arms a
 * smaller one, and one provider's spend never re-arms another cap. `spent`
 * is that scope's spend. Call inside an IMMEDIATE transaction.
 */
export function rearmSpendAlerts(
  db: Database,
  o: { spentMicroUsd: number; capMicroUsd: number; now: number; scope?: string },
): boolean {
  if (!belowRearmLevel(o.spentMicroUsd, o.capMicroUsd)) return false;
  if (
    warnArmed(db, o.capMicroUsd, o.now, o.scope) &&
    capPingArmed(db, o.capMicroUsd, o.now, o.scope)
  ) {
    return false;
  }
  insertAlert(db, { kind: SPEND_ALERT_REARM, ...o });
  return true;
}

/**
 * After a call settled: at or past 80% of this cap with its warning armed,
 * record one undelivered `warn` row and return the warning (a provider cap's
 * carries its `scope`); under the re-arm level, re-arm. `spent` is that
 * scope's spend. Call inside an IMMEDIATE transaction. A zero cap never warns.
 */
export function recordSpendWarning(
  db: Database,
  o: { spentMicroUsd: number; capMicroUsd: number; now: number; scope?: string },
): SpendWarning | null {
  if (o.capMicroUsd <= 0) return null;
  if (!atWarnThreshold(o.spentMicroUsd, o.capMicroUsd)) {
    rearmSpendAlerts(db, o);
    return null;
  }
  if (!warnArmed(db, o.capMicroUsd, o.now, o.scope)) return null;
  insertAlert(db, { kind: SPEND_ALERT_WARN, ...o });
  const w: SpendWarning = {
    spentMicroUsd: o.spentMicroUsd,
    capMicroUsd: o.capMicroUsd,
    percent: spendPercent(o.spentMicroUsd, o.capMicroUsd),
  };
  const scope = scopeKey(o.scope);
  if (scope !== TOTAL_SPEND_SCOPE) w.scope = scope;
  return w;
}

/** One claimed cap's warning: its scope and the spend to report against its cap. */
export type ClaimedScopeWarning = { scope: string; spentMicroUsd: number; capMicroUsd: number };

export type ClaimedSpendWarnings = {
  ids: string[];
  /** Spend to report (current, else as recorded) against the latest claimed warning's cap. */
  latest: { spentMicroUsd: number; capMicroUsd: number };
  /** SAFE-15: one warning per claimed cap scope, oldest first. */
  warnings: ClaimedScopeWarning[];
};

/**
 * Claim every undelivered `warn` row of the last 24 h (marks it delivered)
 * in one IMMEDIATE transaction, so two posters never both deliver it, and
 * return one warning per cap scope (SAFE-15). `currentSpentMicroUsd(scope)`
 * (read inside the transaction) is the spend to report for that scope; while
 * it is back under 80% of that scope's latest warning cap, that scope's rows
 * are not claimed and stay pending: the crossing stays disarmed (no second
 * `warn` row), so the first pass that sees 80% again delivers it once.
 * Null when there is nothing to deliver now.
 */
export function claimSpendWarnings(
  db: Database,
  now: number,
  currentSpentMicroUsd?: (scope: string) => number,
): ClaimedSpendWarnings | null {
  const run = db.transaction((): ClaimedSpendWarnings | null => {
    const rows = db
      .query(
        `SELECT id, cap_micro_usd AS cap, spent_micro_usd AS spent, scope FROM spend_alerts
          WHERE kind = ? AND delivered_at IS NULL AND ts > ?
          ORDER BY rowid`,
      )
      .all(SPEND_ALERT_WARN, now - WINDOW_MS) as Array<{
      id: string;
      cap: number;
      spent: number;
      scope: string;
    }>;
    if (rows.length === 0) return null;
    const byScope = new Map<string, typeof rows>();
    for (const r of rows) {
      const g = byScope.get(r.scope);
      if (g) g.push(r);
      else byScope.set(r.scope, [r]);
    }
    const ids: string[] = [];
    const claimed: Array<ClaimedScopeWarning & { at: number }> = [];
    for (const [scope, group] of byScope) {
      const last = group[group.length - 1]!;
      let spent = last.spent;
      if (currentSpentMicroUsd) {
        try {
          spent = currentSpentMicroUsd(scope);
        } catch {
          // Keep the recorded amount.
        }
      }
      if (!atWarnThreshold(spent, last.cap)) continue;
      ids.push(...group.map((r) => r.id));
      claimed.push({ scope, spentMicroUsd: spent, capMicroUsd: last.cap, at: rows.indexOf(last) });
    }
    if (ids.length === 0) return null;
    claimed.sort((a, b) => a.at - b.at);
    db.run(
      `UPDATE spend_alerts SET delivered_at = ? WHERE id IN (${ids.map(() => "?").join(", ")})`,
      [now, ...ids],
    );
    const warnings = claimed.map(({ scope, spentMicroUsd, capMicroUsd }) => ({
      scope,
      spentMicroUsd,
      capMicroUsd,
    }));
    const latest = warnings[warnings.length - 1]!;
    return {
      ids,
      latest: { spentMicroUsd: latest.spentMicroUsd, capMicroUsd: latest.capMicroUsd },
      warnings,
    };
  });
  return run.immediate();
}

/** Put claimed warnings back (the post that would have carried them failed). */
export function releaseSpendWarnings(db: Database, ids: readonly string[]): void {
  if (ids.length === 0) return;
  db.run(
    `UPDATE spend_alerts SET delivered_at = NULL WHERE id IN (${ids.map(() => "?").join(", ")})`,
    [...ids],
  );
}

/**
 * Once per cap episode: the id of a newly recorded (delivered) `cap` row
 * when the owner has not been pinged about a spend-cap stop at this cap
 * (scope and value; default the total cap) since its last re-arm and within
 * 24 h; null otherwise. One IMMEDIATE transaction, so concurrent posters ping
 * once. Hand the id to releaseSpendCapPing when the post that carried the
 * ping failed.
 */
export function claimSpendCapPing(
  db: Database,
  o: { now: number; capMicroUsd: number; spentMicroUsd: number; scope?: string },
): string | null {
  const run = db.transaction((): string | null => {
    if (!capPingArmed(db, o.capMicroUsd, o.now, o.scope)) return null;
    return insertAlert(db, { kind: SPEND_ALERT_CAP, ...o, deliveredAt: o.now });
  });
  return run.immediate();
}

/** Undo a cap-ping claim (its post failed), so the next spend-cap ask pings. */
export function releaseSpendCapPing(db: Database, id: string): void {
  db.run("DELETE FROM spend_alerts WHERE id = ? AND kind = ?", [id, SPEND_ALERT_CAP]);
}

/**
 * SAFE-8 (#98) — the `spend_alerts` table: when the 80% warning is armed,
 * which warnings still have to reach the owner, and when the owner was last
 * pinged about the cap.
 *
 * Recording and delivery are separate. Whatever process makes the provider
 * call (a bridge-spawned run, WATCH, the daemon, a delegate worker, the CLI)
 * records a `warn` row when a settled call takes rolling 24 h spend to 80% of
 * the cap. The row stays undelivered until the Discord bridge — the only
 * surface that knows the owner — claims it on its next post and pings the
 * owner (src/agent/spend-outbox.ts). A warning is never used up by a run whose
 * surface could not show it, nor by a post made while spend is back under 80%
 * (it stays pending, still disarming its crossing, until a post sees 80%
 * again or it is 24 h old).
 *
 * Kinds (constants; the table holds no free text, SAFE-6):
 *  - `warn`  80% reached while the warning was armed (disarms it).
 *  - `rearm` spend seen back under SPEND_REARM_PERCENT while something was
 *            disarmed; re-arms both the warning and the cap ping.
 *  - `cap`   the bridge pinged the owner about a spend-cap stop (disarms the
 *            ping for the rest of the cap episode).
 *
 * Every row carries the cap value it applies to. The warning for a cap value
 * is armed unless a `warn` row for that value is newer than the last `rearm`
 * for that value and less than 24 h old; the cap ping likewise with `cap`
 * rows. A new cap value is armed. The gap between 80% and the re-arm level keeps spend that
 * hovers around 80% (old calls leaving the window, new ones arriving) from
 * warning on every call. Callers run these inside their own IMMEDIATE
 * transaction so concurrent processes see one consistent state.
 */

import type { Database } from "bun:sqlite";
import { atWarnThreshold, SPEND_REARM_PERCENT, spendPercent } from "./spend-notice.ts";
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
  delivered_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_spend_alerts_ts ON spend_alerts(ts);
`;

/** Create `spend_alerts` (idempotent; adds `delivered_at` to an older table). */
export function ensureSpendAlerts(db: Database): void {
  db.exec(SPEND_ALERTS_SQL);
  const cols = db.query("PRAGMA table_info(spend_alerts)").all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "delivered_at")) {
    db.exec("ALTER TABLE spend_alerts ADD COLUMN delivered_at INTEGER");
  }
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

function lastRearm(db: Database, capMicroUsd: number): number {
  return maxRowid(db, "kind = ? AND cap_micro_usd = ?", [SPEND_ALERT_REARM, capMicroUsd]);
}

function insertAlert(
  db: Database,
  a: { kind: string; now: number; capMicroUsd: number; spentMicroUsd: number; deliveredAt?: number },
): string {
  const id = crypto.randomUUID();
  db.run(
    `INSERT INTO spend_alerts (id, ts, kind, cap_micro_usd, spent_micro_usd, delivered_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, a.now, a.kind, a.capMicroUsd, a.spentMicroUsd, a.deliveredAt ?? null],
  );
  return id;
}

/** Armed unless a `kind` row for this cap value is newer than its last re-arm and < 24 h old. */
function armed(db: Database, kind: string, capMicroUsd: number, now: number): boolean {
  const last = maxRowid(db, "kind = ? AND cap_micro_usd = ? AND ts > ?", [
    kind,
    capMicroUsd,
    now - WINDOW_MS,
  ]);
  return last === 0 || lastRearm(db, capMicroUsd) > last;
}

/** The 80% warning for this cap value may fire (see module doc). */
export function warnArmed(db: Database, capMicroUsd: number, now: number): boolean {
  return armed(db, SPEND_ALERT_WARN, capMicroUsd, now);
}

/** The owner may be pinged about a spend-cap stop at this cap value (see module doc). */
export function capPingArmed(db: Database, capMicroUsd: number, now: number): boolean {
  return armed(db, SPEND_ALERT_CAP, capMicroUsd, now);
}

/**
 * Record a `rearm` row for this cap value when spend is under its re-arm
 * level and a recent `warn` or `cap` row for it is still in force. Per cap
 * value, so a process with a much larger cap never re-arms a smaller one.
 * Call inside an IMMEDIATE transaction.
 */
export function rearmSpendAlerts(
  db: Database,
  o: { spentMicroUsd: number; capMicroUsd: number; now: number },
): boolean {
  if (!belowRearmLevel(o.spentMicroUsd, o.capMicroUsd)) return false;
  if (
    warnArmed(db, o.capMicroUsd, o.now) &&
    capPingArmed(db, o.capMicroUsd, o.now)
  ) {
    return false;
  }
  insertAlert(db, { kind: SPEND_ALERT_REARM, ...o });
  return true;
}

/**
 * After a call settled: at or past 80% with the warning armed, record one
 * undelivered `warn` row and return the warning; under the re-arm level,
 * re-arm. Call inside an IMMEDIATE transaction. A zero cap never warns.
 */
export function recordSpendWarning(
  db: Database,
  o: { spentMicroUsd: number; capMicroUsd: number; now: number },
): SpendWarning | null {
  if (o.capMicroUsd <= 0) return null;
  if (!atWarnThreshold(o.spentMicroUsd, o.capMicroUsd)) {
    rearmSpendAlerts(db, o);
    return null;
  }
  if (!warnArmed(db, o.capMicroUsd, o.now)) return null;
  insertAlert(db, { kind: SPEND_ALERT_WARN, ...o });
  return {
    spentMicroUsd: o.spentMicroUsd,
    capMicroUsd: o.capMicroUsd,
    percent: spendPercent(o.spentMicroUsd, o.capMicroUsd),
  };
}

export type ClaimedSpendWarnings = {
  ids: string[];
  /** Spend to report (current, else as recorded) against the latest warning's cap. */
  latest: { spentMicroUsd: number; capMicroUsd: number };
};

/**
 * Claim every undelivered `warn` row of the last 24 h (marks it delivered)
 * in one IMMEDIATE transaction, so two posters never both deliver it.
 * `currentSpentMicroUsd` (read inside the transaction) is the spend to
 * report; while it is back under 80% of the latest warning's cap nothing is
 * claimed and the rows stay pending: the crossing stays disarmed (no second
 * `warn` row), so the first post that sees 80% again delivers it once.
 * Null when there is nothing to deliver now.
 */
export function claimSpendWarnings(
  db: Database,
  now: number,
  currentSpentMicroUsd?: () => number,
): ClaimedSpendWarnings | null {
  const run = db.transaction((): ClaimedSpendWarnings | null => {
    const rows = db
      .query(
        `SELECT id, cap_micro_usd AS cap, spent_micro_usd AS spent FROM spend_alerts
          WHERE kind = ? AND delivered_at IS NULL AND ts > ?
          ORDER BY rowid`,
      )
      .all(SPEND_ALERT_WARN, now - WINDOW_MS) as Array<{ id: string; cap: number; spent: number }>;
    if (rows.length === 0) return null;
    const last = rows[rows.length - 1]!;
    let spent = last.spent;
    if (currentSpentMicroUsd) {
      try {
        spent = currentSpentMicroUsd();
      } catch {
        // Keep the recorded amount.
      }
    }
    if (!atWarnThreshold(spent, last.cap)) return null;
    const ids = rows.map((r) => r.id);
    db.run(
      `UPDATE spend_alerts SET delivered_at = ? WHERE id IN (${ids.map(() => "?").join(", ")})`,
      [now, ...ids],
    );
    return { ids, latest: { spentMicroUsd: spent, capMicroUsd: last.cap } };
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
 * value since its last re-arm and within 24 h; null otherwise. One IMMEDIATE
 * transaction, so concurrent posters ping once. Hand the id to
 * releaseSpendCapPing when the post that carried the ping failed.
 */
export function claimSpendCapPing(
  db: Database,
  o: { now: number; capMicroUsd: number; spentMicroUsd: number },
): string | null {
  const run = db.transaction((): string | null => {
    if (!capPingArmed(db, o.capMicroUsd, o.now)) return null;
    return insertAlert(db, { kind: SPEND_ALERT_CAP, ...o, deliveredAt: o.now });
  });
  return run.immediate();
}

/** Undo a cap-ping claim (its post failed), so the next spend-cap ask pings. */
export function releaseSpendCapPing(db: Database, id: string): void {
  db.run("DELETE FROM spend_alerts WHERE id = ? AND kind = ?", [id, SPEND_ALERT_CAP]);
}

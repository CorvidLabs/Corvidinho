/**
 * SAFE-8 (#98) — delivery side of the spend alerts, for the Discord bridge.
 *
 * Runs record the 80% warning in `spend_alerts` wherever they happen (bridge
 * child, WATCH, daemon schedule, delegate worker, CLI). The bridge is the one
 * surface that knows the owner, so its owner DM pass (after each run and on
 * every scheduler tick, src/discord/spend-dm.ts) takes the pending warning
 * from here and sends it to the owner only (SAFE-14.a: never in a channel
 * post). A warning recorded by a run whose surface could not show it (WATCH,
 * daemon, a delegate worker, a schedule whose channel left the allowlist)
 * therefore reaches the owner on the bridge's next pass instead of being
 * lost.
 *
 * The outbox also decides whether a `spend-cap` ask pings the owner: once per
 * cap episode across chat, slash commands and schedules (spend-alerts.ts
 * `cap` rows), so a busy channel at the cap does not ping on every message.
 *
 * A claim is handed back when the DM or post that carried it did not go out
 * (`release`), so one failed send never swallows a warning or the episode's
 * owner ping. Never throws: a DB problem falls back to the run's own
 * `spendWarning` and to pinging (a notice too many beats a silent one).
 */

import type { Database } from "bun:sqlite";
import {
  claimSpendCapPing,
  claimSpendWarnings,
  ensureSpendAlerts,
  releaseSpendCapPing,
  releaseSpendWarnings,
  spendAlertsExist,
} from "./spend-alerts.ts";
import { ensureSpendLedger, parseSpendCap, SpendLedger } from "./spend.ts";
import { spendPercent } from "./spend-notice.ts";
import type { SpendWarning } from "./types.ts";

export type TakenSpendWarning = {
  /** Amounts to send (current 24 h spend against the recorded cap). */
  warning: SpendWarning;
  /** Hand the warning back when the DM that carried it failed. */
  release(): void;
};

/** A spend-cap owner ping this post may carry (once per cap episode). */
export type SpendCapPingClaim = {
  /** Hand the ping back when the post that carried it failed. */
  release(): void;
};

export type SpendAlertOutbox = {
  /**
   * The SAFE-8 80% warning to send the owner now (by DM, SAFE-14.a), or null.
   * With a DB: claims every undelivered warning of the last 24 h (so no other
   * pass repeats it) and returns it with current spend; null when nothing is
   * pending, or while spend is back under 80% of that cap (the warning then
   * stays pending for the first pass that sees 80% again). Without a DB (or
   * when the table is missing): `fallback`, the run's own warning.
   */
  takeWarning(fallback?: SpendWarning): TakenSpendWarning | null;
  /**
   * A claim when a `spend-cap` ask should ping the owner: the first time in
   * a cap episode (re-armed once spend is back under 70% or after 24 h);
   * null when this episode already pinged.
   */
  claimCapPing(): SpendCapPingClaim | null;
};

const NOOP = () => {};

function fallbackWarning(fallback?: SpendWarning): TakenSpendWarning | null {
  return fallback ? { warning: fallback, release: NOOP } : null;
}

/** Outbox over the bridge's shared DB (see module doc). */
export function createSpendAlertOutbox(opts: {
  db?: Database;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
}): SpendAlertOutbox {
  const db = opts.db;
  const env = opts.env ?? process.env;
  const now = opts.now ?? Date.now;
  return {
    takeWarning(fallback) {
      if (!db) return fallbackWarning(fallback);
      try {
        if (!spendAlertsExist(db)) return fallbackWarning(fallback);
        ensureSpendAlerts(db);
        const t = now();
        // Current spend, read inside the claim (a ledger error keeps the recorded amount).
        const claimed = claimSpendWarnings(db, t, () => new SpendLedger(db).window(t).spentMicroUsd);
        if (!claimed) return null;
        const { spentMicroUsd: spent, capMicroUsd: cap } = claimed.latest;
        return {
          warning: { spentMicroUsd: spent, capMicroUsd: cap, percent: spendPercent(spent, cap) },
          release: () => {
            try {
              releaseSpendWarnings(db, claimed.ids);
            } catch {
              // The warning stays marked delivered.
            }
          },
        };
      } catch {
        return fallbackWarning(fallback);
      }
    },
    claimCapPing() {
      if (!db) return { release: NOOP };
      try {
        ensureSpendLedger(db);
        const t = now();
        const cap = parseSpendCap(env);
        const id = claimSpendCapPing(db, {
          now: t,
          capMicroUsd: cap.kind === "cap" ? cap.capMicroUsd : 0,
          spentMicroUsd: new SpendLedger(db).window(t).spentMicroUsd,
        });
        if (!id) return null;
        return {
          release: () => {
            try {
              releaseSpendCapPing(db, id);
            } catch {
              // The episode stays pinged.
            }
          },
        };
      } catch {
        return { release: NOOP };
      }
    },
  };
}

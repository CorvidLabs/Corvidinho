/**
 * SAFE-8 (#98) — delivery side of the spend alerts, for the Discord bridge.
 *
 * Runs record the 80% warning in `spend_alerts` wherever they happen (bridge
 * child, WATCH, daemon schedule, delegate worker, CLI). The bridge is the one
 * surface that knows the owner, so every bridge post (chat reply, /work,
 * /session start, schedule post) takes the pending warning from here and
 * pings the owner with it. A warning recorded by a run whose surface could
 * not show it (WATCH, daemon, a delegate worker, a schedule whose channel
 * left the allowlist) therefore reaches the owner on the bridge's next post
 * instead of being lost.
 *
 * The outbox also decides whether a `spend-cap` ask pings the owner: once per
 * cap episode across chat, slash commands and schedules (spend-alerts.ts
 * `cap` rows), so a busy channel at the cap does not ping on every message.
 *
 * Never throws: a DB problem falls back to the run's own `spendWarning` and
 * to pinging (a notice too many beats a silent one).
 */

import type { Database } from "bun:sqlite";
import {
  claimSpendCapPing,
  claimSpendWarnings,
  ensureSpendAlerts,
  releaseSpendWarnings,
  spendAlertsExist,
} from "./spend-alerts.ts";
import { ensureSpendLedger, parseSpendCap, SpendLedger } from "./spend.ts";
import { atWarnThreshold, spendPercent } from "./spend-notice.ts";
import type { SpendWarning } from "./types.ts";

export type TakenSpendWarning = {
  /** Amounts to post (current 24 h spend against the recorded cap). */
  warning: SpendWarning;
  /** Hand the warning back when the post that carried it failed. */
  release(): void;
};

export type SpendAlertOutbox = {
  /**
   * The SAFE-8 80% warning to append to the post being sent now, or null.
   * With a DB: claims every undelivered warning of the last 24 h (so no other
   * post repeats it) and returns it with current spend; null when nothing is
   * pending or spend has meanwhile dropped under 80% of that cap. Without a
   * DB (or when the table is missing): `fallback`, the run's own warning.
   */
  takeWarning(fallback?: SpendWarning): TakenSpendWarning | null;
  /**
   * True when a `spend-cap` ask should ping the owner: the first time in a
   * cap episode (re-armed once spend is back under 70% or after 24 h).
   */
  claimCapPing(): boolean;
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
        const claimed = claimSpendWarnings(db, t);
        if (!claimed) return null;
        const cap = claimed.latest.capMicroUsd;
        let spent = claimed.latest.spentMicroUsd;
        try {
          spent = new SpendLedger(db).window(t).spentMicroUsd;
        } catch {
          // Keep the recorded amount.
        }
        if (!atWarnThreshold(spent, cap)) return null;
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
      if (!db) return true;
      try {
        ensureSpendLedger(db);
        const t = now();
        const cap = parseSpendCap(env);
        return claimSpendCapPing(db, {
          now: t,
          capMicroUsd: cap.kind === "cap" ? cap.capMicroUsd : 0,
          spentMicroUsd: new SpendLedger(db).window(t).spentMicroUsd,
        });
      } catch {
        return true;
      }
    },
  };
}

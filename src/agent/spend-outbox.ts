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
 * SAFE-15: warnings and episodes are kept per cap (the total cap and each
 * provider cap, SAFE-14), so each cap warns once per crossing and each cap's
 * stop pings once per episode (the ask names its scopes, `spendScopes`).
 *
 * SAFE-16: a warning taken here carries the count of calls at an unknown
 * price in its cap's window (`unknownCalls`), so the owner's DM reads
 * "$X + unknown" instead of passing such spend off as $0.
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
import { ensureSpendLedger, parseProviderCapList, parseSpendCap, SpendLedger } from "./spend.ts";
import {
  PROVIDER_SPEND_CAPS_ENV,
  providerOfSpendScope,
  spendPercent,
  TOTAL_SPEND_SCOPE,
} from "./spend-notice.ts";
import type { SpendWarning } from "./types.ts";

export type TakenSpendWarning = {
  /** Amounts to send (current 24 h spend against the recorded cap): the latest claimed cap's. */
  warning: SpendWarning;
  /**
   * SAFE-15: one warning per cap claimed in this pass (the total cap and each
   * provider cap, oldest first); absent means just `warning`.
   */
  warnings?: SpendWarning[];
  /** Hand the warning(s) back when the DM that carried them failed. */
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
   * a cap episode (re-armed once that cap's spend is back under 70% or after
   * 24 h); null when this episode already pinged. `scopes` are the caps the
   * stop tripped (the ask's `spendScopes`; default the total cap): the claim
   * covers each of them whose episode has not pinged yet, and is null only
   * when none is left.
   */
  claimCapPing(scopes?: readonly string[]): SpendCapPingClaim | null;
};

const NOOP = () => {};

/**
 * The cap value an episode is keyed on: the total cap, or the provider's
 * entry of the provider list; 0 when unset or unreadable (as for an invalid
 * total today).
 */
function capForScope(env: NodeJS.ProcessEnv, provider: string | undefined): number {
  if (provider === undefined) {
    const cap = parseSpendCap(env);
    return cap.kind === "cap" ? cap.capMicroUsd : 0;
  }
  const raw = env[PROVIDER_SPEND_CAPS_ENV]?.trim();
  return (raw ? parseProviderCapList(raw)?.get(provider.toLowerCase()) : undefined) ?? 0;
}

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
        // Current spend of each cap's scope, read inside the claim (a ledger
        // error keeps the recorded amount).
        const ledger = new SpendLedger(db);
        const claimed = claimSpendWarnings(
          db,
          t,
          (scope) => ledger.window(t, providerOfSpendScope(scope)).spentMicroUsd,
        );
        if (!claimed) return null;
        const warnings = claimed.warnings.map(({ scope, spentMicroUsd: spent, capMicroUsd: cap }) => {
          const w: SpendWarning = { spentMicroUsd: spent, capMicroUsd: cap, percent: spendPercent(spent, cap) };
          if (scope !== TOTAL_SPEND_SCOPE) w.scope = scope;
          // SAFE-16: the DM reads "$X + unknown" while that cap's window holds a call at an unknown price.
          try {
            const unknown = ledger.window(t, providerOfSpendScope(scope)).unknownCalls;
            if (unknown > 0) w.unknownCalls = unknown;
          } catch {
            // Keep the priced amount alone.
          }
          return w;
        });
        return {
          warning: warnings[warnings.length - 1]!,
          warnings,
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
    claimCapPing(scopes) {
      if (!db) return { release: NOOP };
      try {
        ensureSpendLedger(db);
        const t = now();
        const ledger = new SpendLedger(db);
        const ids: string[] = [];
        for (const scope of scopes && scopes.length > 0 ? scopes : [TOTAL_SPEND_SCOPE]) {
          const provider = providerOfSpendScope(scope);
          const id = claimSpendCapPing(db, {
            now: t,
            capMicroUsd: capForScope(env, provider),
            spentMicroUsd: ledger.window(t, provider).spentMicroUsd,
            scope,
          });
          if (id) ids.push(id);
        }
        if (ids.length === 0) return null;
        return {
          release: () => {
            for (const id of ids) {
              try {
                releaseSpendCapPing(db, id);
              } catch {
                // The episode stays pinged.
              }
            }
          },
        };
      } catch {
        return { release: NOOP };
      }
    },
  };
}

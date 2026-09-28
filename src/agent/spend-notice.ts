/**
 * SAFE-8 / AUTONOMOUS-8 (#98) — what the daily spend cap says to people.
 *
 * Pure formatting, no I/O:
 *  - the 80% warning line (once per crossing; the ledger dedupes),
 *  - the spend-cap ask: the runner stops before a provider call that would
 *    pass the cap and asks the owner through the AUTONOMY-1/2 ask path
 *    instead of refusing or spending past the cap,
 *  - the `doctor` and Discord `/status` lines (24 h spend vs the cap).
 *
 * Bridges rebuild the warning from integer micro-USD (SpendWarning), never
 * from child-written text. A model id is SAFE-6 scrubbed before it is quoted.
 * The Approve card (#96) does not exist yet, so a reply cannot lift the cap:
 * the ask is addressed to the operator and names the operator action that
 * does (raise or unset the cap and restart, or wait for the window) instead
 * of asking a yes/no question. The run's summary (posted wherever the run
 * reports, e.g. a public GitHub comment for WATCH) is a generic line without
 * amounts or env internals; the details live in the ask question.
 */

import { scrubSecrets } from "../store/scrub.ts";
import type { SpendWindow } from "./spend.ts";
import type { CapabilityTier } from "./tier.ts";
import type { HumanAsk, SpendWarning } from "./types.ts";

/** Operator knob: daily (rolling 24 h) USD cap on provider calls. Unset = off. */
export const SPEND_CAP_ENV = "CORVIDINHO_DAILY_SPEND_CAP_USD";

/** Warn once when rolling 24 h spend reaches this percent of the cap. */
export const SPEND_WARN_PERCENT = 80;

/**
 * The warning (and the cap ping) re-arm once spend is seen back under this
 * percent, so the next crossing warns again (spend-alerts.ts).
 */
export const SPEND_REARM_PERCENT = 70;

/**
 * TaskResult summary of a run stopped by the spend cap: safe for any audience
 * (no amounts, no env names). The ask question carries the details.
 */
export const SPEND_CAP_SUMMARY =
  "Paused before calling the model: the operator's daily spend cap (SAFE-8) needs attention, so nothing more was spent.";

/** Largest amount a bridge accepts from a child's result frame (micro-USD). */
const MAX_MICRO_USD = 1e15;

/** Whole cents print 2 decimals; anything else 4, rounded up (never under-reports spend). */
export function formatUsd(microUsd: number): string {
  const [unit, digits] = microUsd % 10_000 === 0 ? [10_000, 2] : [100, 4];
  const n = Math.ceil(Math.max(0, microUsd) / unit);
  const scale = 10 ** digits;
  return `$${Math.floor(n / scale)}.${String(n % scale).padStart(digits, "0")}`;
}

/** floor(spent × 100 / cap); a zero cap is always at 100%. */
export function spendPercent(spentMicroUsd: number, capMicroUsd: number): number {
  if (capMicroUsd <= 0) return 100;
  return Math.floor((Math.max(0, spentMicroUsd) * 100) / capMicroUsd);
}

/** True once spend is at or past the warning threshold. */
export function atWarnThreshold(spentMicroUsd: number, capMicroUsd: number): boolean {
  return spentMicroUsd * 100 >= capMicroUsd * SPEND_WARN_PERCENT;
}

// ─── 80% warning ───────────────────────────────────────────────────────────

/** Runner-side warning text (Text event, CLI stderr). */
export function formatSpendWarningLine(w: SpendWarning): string {
  return (
    `⚠️ Spend warning (SAFE-8): ${formatUsd(w.spentMicroUsd)} of the ` +
    `${formatUsd(w.capMicroUsd)} daily cap used in the last 24h (${w.percent}%). ` +
    "At the cap I stop and ask before spending more."
  );
}

function microUsd(v: unknown): number | undefined {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= MAX_MICRO_USD
    ? v
    : undefined;
}

/**
 * Read a SpendWarning from a parsed `result` frame (child output). Only the
 * two amounts are taken; the percent is recomputed. Undefined unless valid.
 */
export function spendWarningFromUnknown(raw: unknown): SpendWarning | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const spent = microUsd(o.spentMicroUsd);
  const cap = microUsd(o.capMicroUsd);
  if (spent === undefined || cap === undefined) return undefined;
  return { spentMicroUsd: spent, capMicroUsd: cap, percent: spendPercent(spent, cap) };
}

// ─── Spend-cap ask (100%) ──────────────────────────────────────────────────

/** Where the operator makes the change. */
const OPERATOR_HINT =
  "in the environment Corvidinho runs with and restarts the bridge or daemon so new runs pick it up";
/** No Approve card yet (#96): say plainly that answering does not unblock. */
const NO_REPLY_NOTE = "Replying can't lift the cap — this needs the operator.";

function spendCapAsk(question: string): HumanAsk {
  return { reason: "spend-cap", question };
}

/** The next call's estimate would push 24 h spend past the cap. */
export function spendCapReachedAsk(o: {
  spentMicroUsd: number;
  estimateMicroUsd: number;
  capMicroUsd: number;
}): HumanAsk {
  const pct = spendPercent(o.spentMicroUsd, o.capMicroUsd);
  return spendCapAsk(
    `Daily spend cap reached (SAFE-8): ${formatUsd(o.spentMicroUsd)} spent in the last 24h ` +
      `(${pct}% of the ${formatUsd(o.capMicroUsd)} cap), and the next provider call ` +
      `(~${formatUsd(o.estimateMicroUsd)}) would pass it, so I stopped before sending it. ` +
      `To continue, the operator raises ${SPEND_CAP_ENV} (or unsets it) ${OPERATOR_HINT}, ` +
      `or waits until earlier spend leaves the 24h window; then ask again. ${NO_REPLY_NOTE}`,
  );
}

/** The cap value is set but unreadable: fail closed, ask to fix it. */
export function spendCapInvalidAsk(): HumanAsk {
  return spendCapAsk(
    `Spend cap can't be enforced (SAFE-8): ${SPEND_CAP_ENV} is set but is not a plain USD ` +
      "amount (e.g. 5 or 2.50), so I stopped before calling the provider. " +
      `To continue, the operator fixes or unsets it ${OPERATOR_HINT}; then ask again. ${NO_REPLY_NOTE}`,
  );
}

/**
 * A model with no known price is never counted as free. `modelKey` is the env
 * key that set the run's model (AGENT-5: a per-tier key such as
 * `CORVIDINHO_LLM_MODEL_READ` wins over `CORVIDINHO_LLM_MODEL`), so the ask
 * names the key that actually has to change.
 */
export function spendCapUnpricedAsk(
  model: string,
  capMicroUsd: number,
  modelKey = "CORVIDINHO_LLM_MODEL",
): HumanAsk {
  const shown = scrubSecrets(model).replace(/\s+/g, " ").trim().slice(0, 80) || "(none)";
  return spendCapAsk(
    `Spend cap can't be enforced (SAFE-8): model "${shown}" has no known price, so I can't ` +
      `count it against the ${formatUsd(capMicroUsd)} daily cap and stopped before calling ` +
      `the provider. To continue, the operator switches ${modelKey} to a priced model ` +
      `or unsets ${SPEND_CAP_ENV} ${OPERATOR_HINT}; then ask again. ${NO_REPLY_NOTE}`,
  );
}

/** The ledger could not be opened or written: the cap cannot be checked. */
export function spendCapLedgerAsk(error: string): HumanAsk {
  const why = scrubSecrets(error).replace(/\s+/g, " ").trim().slice(0, 200) || "unknown error";
  return spendCapAsk(
    `Spend cap can't be enforced (SAFE-8): the spend ledger is unavailable (${why}), so I ` +
      "stopped before calling the provider. To continue, the operator checks the data dir " +
      `(CORVIDINHO_DATA_DIR) or unsets ${SPEND_CAP_ENV} ${OPERATOR_HINT}; then ask again. ` +
      NO_REPLY_NOTE,
  );
}

// ─── doctor / Discord /status (AUTONOMOUS-8) ───────────────────────────────

/** What the ledger says right now, for doctor and /status. */
export type SpendSnapshot =
  | { kind: "off" }
  | { kind: "invalid" }
  | { kind: "unreadable"; error: string }
  | {
      kind: "cap";
      capMicroUsd: number;
      window: SpendWindow;
      /**
       * Model price-checked: the configured model (loadLlmEnv().model), or,
       * when it is priced but a per-tier model is not (AGENT-5), that one.
       */
      model: string;
      priced: boolean;
      /** Set when `model` is the unpriced model of this tier only (AGENT-5). */
      tier?: CapabilityTier;
    };

export type SpendDoctorLine = { ok: true; mark: "ok" | "warn" | "info"; detail: string };

const STOPS_AND_ASKS = "runs stop and ask before calling the provider";

/** Doctor line. Informational: `ok` is always true, so it never fails doctor. */
export function formatSpendDoctorLine(s: SpendSnapshot): SpendDoctorLine {
  switch (s.kind) {
    case "off":
      return {
        ok: true,
        mark: "info",
        detail: `no daily cap set (${SPEND_CAP_ENV}); provider spend is not tracked`,
      };
    case "invalid":
      return {
        ok: true,
        mark: "warn",
        detail: `${SPEND_CAP_ENV} is not a plain USD amount — ${STOPS_AND_ASKS} until it is fixed or unset (SAFE-8)`,
      };
    case "unreadable":
      return {
        ok: true,
        mark: "warn",
        detail: `spend ledger unreadable: ${scrubSecrets(s.error).slice(0, 200)} — ${STOPS_AND_ASKS} (SAFE-8)`,
      };
    case "cap": {
      const { window: w, capMicroUsd: cap } = s;
      const pct = spendPercent(w.spentMicroUsd, cap);
      const estimated = w.estimatedCalls ? `, ${w.estimatedCalls} counted at its estimate` : "";
      const notes: string[] = [];
      if (w.spentMicroUsd >= cap) notes.push(`cap reached — ${STOPS_AND_ASKS}`);
      else if (atWarnThreshold(w.spentMicroUsd, cap)) {
        notes.push(`past the ${SPEND_WARN_PERCENT}% warning — a call that would pass the cap stops and asks first`);
      }
      if (!s.priced) {
        const runs = s.tier ? `${s.tier}-tier runs` : "runs";
        notes.push(
          `model "${scrubSecrets(s.model)}" has no known price, so ${runs} stop and ask before calling the provider`,
        );
      }
      return {
        ok: true,
        mark: notes.length ? "warn" : "ok",
        detail:
          `${formatUsd(w.spentMicroUsd)} of ${formatUsd(cap)} daily cap used in the last 24h ` +
          `(${pct}%; ${w.calls} provider call(s)${estimated}; ${SPEND_CAP_ENV}, SAFE-8)` +
          (notes.length ? `; ${notes.join("; ")}` : ""),
      };
    }
  }
}

/** One `/status` line (Discord markdown, no ids, no raw errors). */
export function formatSpendStatusLine(s: SpendSnapshot): string {
  switch (s.kind) {
    case "off":
      return `Spend cap: off (set ${SPEND_CAP_ENV} to track spend)`;
    case "invalid":
      return `Spend cap: ⚠️ ${SPEND_CAP_ENV} is not a plain USD amount — runs stop and ask`;
    case "unreadable":
      return "Spend cap: ⚠️ spend ledger unreadable — runs stop and ask";
    case "cap": {
      const { window: w, capMicroUsd: cap } = s;
      const pct = spendPercent(w.spentMicroUsd, cap);
      let line = `Spend (24h): ${formatUsd(w.spentMicroUsd)} of ${formatUsd(cap)} daily cap (${pct}%)`;
      if (w.spentMicroUsd >= cap) line += " — 🛑 cap reached, runs stop and ask";
      else if (atWarnThreshold(w.spentMicroUsd, cap)) line += ` — ⚠️ past ${SPEND_WARN_PERCENT}%`;
      if (!s.priced) {
        line += s.tier
          ? ` — ⚠️ ${s.tier}-tier model has no known price, ${s.tier}-tier runs stop and ask`
          : " — ⚠️ model has no known price, runs stop and ask";
      }
      return line;
    }
  }
}

/**
 * SAFE-8 / SAFE-14 / SAFE-15 / AUTONOMOUS-8 (#98) — what the spend caps say
 * to people.
 *
 * Pure formatting, no I/O:
 *  - the 80% warning line (once per crossing of each cap; the ledger dedupes),
 *  - the spend-cap ask: the runner stops before a provider call that would
 *    pass a cap (the total cap, or the call's provider cap) and asks the
 *    owner through the AUTONOMY-1/2 ask path instead of refusing or spending
 *    past the cap,
 *  - the `doctor` and Discord `/status` lines (24 h spend vs each cap; the
 *    owner's lines, and for anyone else only "Work is paused for budget."
 *    while runs stop at a cap, SAFE-14.a).
 *
 * Bridges rebuild the warning from integer micro-USD (SpendWarning), never
 * from child-written text. A model id or provider id is SAFE-6 scrubbed
 * before it is quoted. A reply cannot lift a cap. With an owner configured,
 * a priced call past a cap first waits for the owner's `spend` Approve card
 * (src/agent/spend.ts, SAFE-8 / SAFE-8.a); when that card comes to no
 * (denied, no answer in time, the wait cut short, the card unavailable) the
 * ask says so and how to continue — ask again for a new card and code, or
 * the operator action — without the "replying can't lift the cap" note. With
 * no owner, and for an unpriced model, an unreadable setting or ledger (no
 * price to approve), the ask is addressed to the operator and names the
 * operator action (raise or unset the cap that stopped the call and restart,
 * or wait for the window) instead of asking a yes/no question. The run's
 * summary (posted wherever the run reports, e.g. a public GitHub comment for
 * WATCH) is the generic SPEND_PAUSED_TEXT without amounts, scopes or setting
 * names (SAFE-14.a); the details live in the ask question, which on Discord
 * reaches only the owner, by DM (src/discord/spend-dm.ts).
 *
 * SAFE-16 / SAFE-16.a: a model with no known price is never counted as $0.
 * Its call under a cap waits for the owner's spend card with the amount shown
 * as unknown; an approved one is recorded as `unknown` in the ledger, and
 * every owner line that reports spend (doctor, `/status`, the warning and
 * stop DMs, the card) shows the 24 h spend as "$X + unknown" while the window
 * holds such a call (`formatSpend`). Anyone else still sees only "Work is
 * paused for budget.".
 */

import { scrubSecrets } from "../store/scrub.ts";
import type { SpendWindow } from "./spend.ts";
import type { CapabilityTier } from "./tier.ts";
import type { HumanAsk, SpendWarning } from "./types.ts";

/** Operator knob: the total daily (rolling 24 h) USD cap on provider calls. Unset = off. */
export const SPEND_CAP_ENV = "CORVIDINHO_DAILY_SPEND_CAP_USD";

/**
 * SAFE-14 operator knob: a rolling 24 h USD cap per provider, as a comma list
 * of `provider=USD` keyed on the configured provider id (the endpoint host,
 * `providerId` in src/agent/providers.ts), e.g.
 * `api.openai.com=5,api.anthropic.com=2`. Unset = no provider caps.
 */
export const PROVIDER_SPEND_CAPS_ENV = "CORVIDINHO_PROVIDER_SPEND_CAPS_USD";

/** The scope of the total cap (`CORVIDINHO_DAILY_SPEND_CAP_USD`). */
export const TOTAL_SPEND_SCOPE = "total";

const PROVIDER_SCOPE_PREFIX = "provider:";

/** The scope of one provider's cap: `provider:<id>` (SAFE-14). */
export function providerSpendScope(provider: string): string {
  return `${PROVIDER_SCOPE_PREFIX}${provider}`;
}

/** The provider id of a `provider:<id>` scope; undefined for the total scope. */
export function providerOfSpendScope(scope: string | undefined): string | undefined {
  return scope?.startsWith(PROVIDER_SCOPE_PREFIX) ? scope.slice(PROVIDER_SCOPE_PREFIX.length) : undefined;
}

/** A well-formed scope: `total` or `provider:<id>` (no spaces or commas, at most 255 chars of id). */
export function isSpendScope(v: unknown): v is string {
  return (
    typeof v === "string" &&
    (v === TOTAL_SPEND_SCOPE || /^provider:[^\s,]{1,255}$/.test(v))
  );
}

/** How a provider id is quoted to the owner and operator (SAFE-6 scrubbed, one token). */
function shownProvider(provider: string): string {
  return scrubSecrets(provider).replace(/\s+/g, "").slice(0, 255) || "(unknown)";
}

/** Warn once when rolling 24 h spend reaches this percent of the cap. */
export const SPEND_WARN_PERCENT = 80;

/**
 * The warning (and the cap ping) re-arm once spend is seen back under this
 * percent, so the next crossing warns again (spend-alerts.ts).
 */
export const SPEND_REARM_PERCENT = 70;

/**
 * SAFE-14.a (#98): all anyone but the owner learns about spend — work is
 * paused for budget. No amounts, no cap values, no scopes, no setting names.
 */
export const SPEND_PAUSED_TEXT = "Work is paused for budget.";

/**
 * TaskResult summary of a run stopped by a spend cap: safe for any audience
 * (SAFE-14.a: no amounts, no cap, scope or setting names). The ask question
 * carries the details, for the operator (CLI, logs) and the owner's DM.
 */
export const SPEND_CAP_SUMMARY = SPEND_PAUSED_TEXT;

/** Largest amount a bridge accepts from a child's result frame (micro-USD). */
const MAX_MICRO_USD = 1e15;

/** Whole cents print 2 decimals; anything else 4, rounded up (never under-reports spend). */
export function formatUsd(microUsd: number): string {
  const [unit, digits] = microUsd % 10_000 === 0 ? [10_000, 2] : [100, 4];
  const n = Math.ceil(Math.max(0, microUsd) / unit);
  const scale = 10 ** digits;
  return `$${Math.floor(n / scale)}.${String(n % scale).padStart(digits, "0")}`;
}

/** Most unknown-price calls a bridge accepts from a child's result frame. */
const MAX_UNKNOWN_CALLS = 1e9;

/**
 * SAFE-16 / SAFE-16.a: 24 h spend as the owner sees it — `formatUsd` of the
 * priced spend, plus " + unknown" while the window holds a call whose price
 * is unknown (it is never counted as $0).
 */
export function formatSpend(microUsd: number, unknownCalls?: number): string {
  return unknownCalls && unknownCalls > 0 ? `${formatUsd(microUsd)} + unknown` : formatUsd(microUsd);
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

/**
 * Runner-side warning text (Text event, CLI stderr, the owner's DM). A
 * provider cap's warning names its scope (SAFE-14 / SAFE-15); the total
 * cap's reads as before. Spend that includes calls at an unknown price reads
 * "$X + unknown" (SAFE-16).
 */
export function formatSpendWarningLine(w: SpendWarning): string {
  const provider = providerOfSpendScope(w.scope);
  if (provider !== undefined) {
    const id = shownProvider(provider);
    return (
      `⚠️ Spend warning (SAFE-15, provider:${id}): ${formatSpend(w.spentMicroUsd, w.unknownCalls)} of the ` +
      `${formatUsd(w.capMicroUsd)} daily cap for ${id} used in the last 24h (${w.percent}%). ` +
      "At that cap I stop and ask before spending more on it."
    );
  }
  return (
    `⚠️ Spend warning (SAFE-8): ${formatSpend(w.spentMicroUsd, w.unknownCalls)} of the ` +
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
 * two amounts, a well-formed provider scope and a whole count of calls at an
 * unknown price (SAFE-16) are taken; the percent is recomputed. Undefined
 * unless valid.
 */
export function spendWarningFromUnknown(raw: unknown): SpendWarning | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const spent = microUsd(o.spentMicroUsd);
  const cap = microUsd(o.capMicroUsd);
  if (spent === undefined || cap === undefined) return undefined;
  const w: SpendWarning = { spentMicroUsd: spent, capMicroUsd: cap, percent: spendPercent(spent, cap) };
  if (isSpendScope(o.scope) && o.scope !== TOTAL_SPEND_SCOPE) w.scope = o.scope;
  const unknown = o.unknownCalls;
  if (typeof unknown === "number" && Number.isSafeInteger(unknown) && unknown > 0 && unknown <= MAX_UNKNOWN_CALLS) {
    w.unknownCalls = unknown;
  }
  return w;
}

// ─── Spend-cap ask (100%) ──────────────────────────────────────────────────

/** Where the operator makes the change. */
const OPERATOR_HINT =
  "in the environment Corvidinho runs with and restarts the bridge or daemon so new runs pick it up";
/**
 * Nobody's Approve card can lift this stop (no owner configured, no card
 * path, an unreadable setting or ledger): say plainly that answering does
 * not unblock. Not on a stop that already went through the owner's spend
 * card.
 */
const NO_REPLY_NOTE = "Replying can't lift the cap — this needs the operator.";

/**
 * How the owner's spend card (SAFE-8 / SAFE-8.a) came to no: denied,
 * no answer in time (SAFE-20), the wait cut short (the run was stopped or its
 * request timed out), approved but the call would by then pass a cap the card
 * did not show (`changed`: the approval counts only for what it showed), or
 * the card could not be raised or read.
 */
export type SpendCardOutcome = "denied" | "expired" | "aborted" | "changed" | "unavailable";

/** A spend card that did not let the call through, for the ask. */
export type SpendCardNo = {
  /** The card's request id, when one was recorded. */
  requestId?: string;
  outcome: SpendCardOutcome;
  /** Why it was unavailable (scrubbed and cut when quoted). */
  error?: string;
};

function spendCardNoText(card: SpendCardNo): string {
  const which = card.requestId ? `Approve card ${card.requestId}` : "the Approve card";
  switch (card.outcome) {
    case "denied":
      return `The owner denied ${which}, so the call was not sent and nothing was spent (SAFE-20).`;
    case "expired":
      return (
        `No answer on ${which} in time, so the call was not sent and nothing was spent ` +
        "(SAFE-20: no answer means no; the running Discord bridge DMs the card to the owner, and with no " +
        "bridge running it lapses)."
      );
    case "aborted":
      return (
        `The wait on ${which} was cut short (the run was stopped or its request timed out), so the call ` +
        "was not sent and nothing was spent."
      );
    case "changed":
      return (
        `The owner approved ${which}, but by then the call would also pass a cap the card did not show, ` +
        "so it was not sent and nothing was spent (an approval counts only for what its card showed)."
      );
    case "unavailable": {
      const why = scrubSecrets(card.error ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || "unknown error";
      const what = card.requestId ? `Approve card ${card.requestId}` : "The Approve card";
      return `${what} could not be raised or read (${why}), so the call was not sent and nothing was spent.`;
    }
  }
}

function spendCapAsk(question: string, scopes?: readonly string[]): HumanAsk {
  const ask: HumanAsk = { reason: "spend-cap", question };
  if (scopes && scopes.length > 0) ask.spendScopes = [...scopes];
  return ask;
}

/**
 * One cap a call would pass (or, for a call at an unknown price, one cap that
 * covers it): its scope and that scope's 24 h spend against it.
 * `unknownCalls` counts that scope's calls at an unknown price in the window
 * (SAFE-16: the spend then reads "$X + unknown").
 */
export type SpendTrip = { scope: string; spentMicroUsd: number; capMicroUsd: number; unknownCalls?: number };

/** "$X spent in the last 24h (P% of the $Y cap)", or for a provider "… on <id> … of its $Y cap". */
function tripClause(t: SpendTrip): string {
  const pct = spendPercent(t.spentMicroUsd, t.capMicroUsd);
  const provider = providerOfSpendScope(t.scope);
  const spent = formatSpend(t.spentMicroUsd, t.unknownCalls);
  return provider === undefined
    ? `${spent} spent in the last 24h (${pct}% of the ${formatUsd(t.capMicroUsd)} cap)`
    : `${spent} spent on ${shownProvider(provider)} in the last 24h ` +
        `(${pct}% of its ${formatUsd(t.capMicroUsd)} cap)`;
}

/** The setting the operator raises to lift one cap (never its value). */
function tripSetting(t: SpendTrip): string {
  const provider = providerOfSpendScope(t.scope);
  return provider === undefined
    ? `${SPEND_CAP_ENV} (or unsets it)`
    : `the ${shownProvider(provider)} entry of ${PROVIDER_SPEND_CAPS_ENV} (or removes it)`;
}

/** A scope as shown to the owner and operator: `total` or `provider:<id>` (the id scrubbed, one token). */
export function spendScopeLabel(scope: string): string {
  const provider = providerOfSpendScope(scope);
  return provider === undefined ? TOTAL_SPEND_SCOPE : `provider:${shownProvider(provider)}`;
}

/** The fixed marker naming the cap(s) a stop was at: "Stopped at cap: <scope>." */
function stoppedAt(scopes: readonly string[]): string {
  return `Stopped at cap${scopes.length > 1 ? "s" : ""}: ${scopes.join(", ")}.`;
}

const STOPPED_AT_RE =
  /Stopped at caps?: ((?:total|provider:[^\s,]+?)(?:, (?:total|provider:[^\s,]+?))*)\.(?=\s|$)/;

/**
 * The cap scope(s) a `spend-cap` ask stopped at (SAFE-15): its `spendScopes`,
 * else the "Stopped at cap(s): …" marker of its question — a stop recorded
 * as question text only (a schedule run's stored ask, the daemon's) keeps
 * naming its caps. Undefined for any other ask, or when neither names a
 * well-formed scope (the total cap, as before).
 */
export function spendScopesOf(ask: HumanAsk): string[] | undefined {
  if (ask.reason !== "spend-cap") return undefined;
  if (ask.spendScopes && ask.spendScopes.length > 0) return ask.spendScopes;
  const m = STOPPED_AT_RE.exec(ask.question);
  if (!m) return undefined;
  const scopes = m[1]!.split(", ");
  return scopes.every(isSpendScope) ? [...new Set(scopes)] : undefined;
}

/**
 * The next call's estimate would push 24 h spend past one or more caps (the
 * total cap, the call's provider cap, or both, SAFE-15). The question names
 * each tripped scope (`total`, `provider:<id>`) with its spend and cap, and
 * the ask carries the scopes (`spendScopes`) so a bridge pings the owner once
 * per episode of each cap. Called with plain amounts it is the total cap.
 *
 * With `card` (SAFE-8 / SAFE-8.a) the call was held for the owner's spend
 * card and that card came to no: the question says so (denied, no answer in
 * time, the wait cut short, unavailable), keeps the amounts and the "Stopped
 * at cap" marker, and names both ways on — ask again for a new card and code,
 * or the operator action — with no "replying can't lift the cap" note.
 */
export function spendCapReachedAsk(
  o: (
    | { spentMicroUsd: number; estimateMicroUsd: number; capMicroUsd: number; scope?: string }
    | { estimateMicroUsd: number; trips: readonly SpendTrip[] }
  ) & { card?: SpendCardNo },
): HumanAsk {
  const trips: SpendTrip[] =
    "trips" in o
      ? [...o.trips]
      : [{ scope: o.scope ?? TOTAL_SPEND_SCOPE, spentMicroUsd: o.spentMicroUsd, capMicroUsd: o.capMicroUsd }];
  const est = formatUsd(o.estimateMicroUsd);
  const scopes = trips.map((t) => spendScopeLabel(t.scope));
  const fixes = `raises ${trips.map(tripSetting).join(" and ")}`;
  const held = "so I held it and asked the owner on a spend Approve card to let that one call through (SAFE-8.a)";
  const next = o.card
    ? `${spendCardNoText(o.card)} ${stoppedAt(scopes)} To continue, ask again — the next call past the cap ` +
      `raises a new card and code — or the operator ${fixes} ${OPERATOR_HINT}, or waits until earlier ` +
      "spend leaves the 24h window."
    : `${stoppedAt(scopes)} To continue, the operator ${fixes} ${OPERATOR_HINT}, ` +
      `or waits until earlier spend leaves the 24h window; then ask again. ${NO_REPLY_NOTE}`;
  if (trips.length === 1) {
    const t = trips[0]!;
    const total = providerOfSpendScope(t.scope) === undefined;
    return spendCapAsk(
      `Daily spend cap reached (${total ? "SAFE-8" : "SAFE-15"}): ${tripClause(t)}, and the next ` +
        `${total ? "provider call" : "call to it"} (~${est}) would pass it, ` +
        `${o.card ? held : "so I stopped before sending it"}. ${next}`,
      trips.map((x) => x.scope),
    );
  }
  return spendCapAsk(
    `Daily spend cap reached (SAFE-15): the next provider call (~${est}) would pass ${trips.length} ` +
      `caps, ${o.card ? held : "so I stopped before sending it"}: ` +
      trips.map((t, i) => `${scopes[i]} — ${tripClause(t)}`).join("; ") +
      `. ${next}`,
    trips.map((x) => x.scope),
  );
}

/** What a cap-setting problem is called (never the value). */
function invalidSettingText(keys: readonly string[] | undefined): string {
  const list = keys && keys.length > 0 ? keys : [SPEND_CAP_ENV];
  return list
    .map((k) =>
      k === PROVIDER_SPEND_CAPS_ENV
        ? `${k} is set but is not a comma list of provider=USD entries for configured providers ` +
          "(e.g. api.openai.com=5,api.anthropic.com=2)"
        : `${k} is set but is not a plain USD amount (e.g. 5 or 2.50)`,
    )
    .join(", and ");
}

/**
 * A cap setting is set but unreadable — the total isn't a plain USD amount,
 * or the provider list has a malformed entry or a key that names no
 * configured provider: fail closed, ask to fix it. `keys` names the bad
 * setting(s) (default: the total cap); the value is never echoed.
 */
export function spendCapInvalidAsk(keys?: readonly string[]): HumanAsk {
  const list = keys && keys.length > 0 ? keys : [SPEND_CAP_ENV];
  return spendCapAsk(
    `Spend cap can't be enforced (SAFE-8): ${invalidSettingText(list)}, so I stopped before calling ` +
      `the provider. To continue, the operator fixes or unsets ${list.join(" and ")} ${OPERATOR_HINT}; ` +
      `then ask again. ${NO_REPLY_NOTE}`,
  );
}

/**
 * A model with no known price is never counted as free. `modelKey` is the env
 * key that set the run's model (AGENT-5: a per-tier key such as
 * `CORVIDINHO_LLM_MODEL_READ` wins over `CORVIDINHO_LLM_MODEL`), so the ask
 * names the key that actually has to change. `scope` is the cap that covers
 * the call (default the total cap); a provider cap names its entry.
 *
 * With `card` (SAFE-16.a) the call was held for the owner's spend card, which
 * showed the amount as unknown, and that card came to no: the question says
 * so, keeps the "Stopped at cap" marker, and names both ways on — ask again
 * for a new card and code, or the operator action — without the "replying
 * can't lift the cap" note. There is no price override (SAFE-16.a).
 */
export function spendCapUnpricedAsk(
  model: string,
  capMicroUsd: number,
  modelKey = "CORVIDINHO_LLM_MODEL",
  scope: string = TOTAL_SPEND_SCOPE,
  card?: SpendCardNo,
): HumanAsk {
  const shown = scrubSecrets(model).replace(/\s+/g, " ").trim().slice(0, 80) || "(none)";
  const provider = providerOfSpendScope(scope);
  const cap =
    provider === undefined
      ? `the ${formatUsd(capMicroUsd)} daily cap`
      : `the ${formatUsd(capMicroUsd)} daily cap for ${shownProvider(provider)}`;
  const unset =
    provider === undefined
      ? `unsets ${SPEND_CAP_ENV}`
      : `removes the ${shownProvider(provider)} entry of ${PROVIDER_SPEND_CAPS_ENV}`;
  if (card) {
    return spendCapAsk(
      `Spend at an unknown price (SAFE-16.a): model "${shown}" has no known price, so I held its call ` +
        `under ${cap} and asked the owner on a spend Approve card showing the amount as unknown ` +
        `(never counted as $0). ${spendCardNoText(card)} ${stoppedAt([spendScopeLabel(scope)])} ` +
        "To continue, ask again — the next call at an unknown price raises a new card and code — or the " +
        `operator switches ${modelKey} to a priced model or ${unset} ${OPERATOR_HINT}.`,
      [scope],
    );
  }
  return spendCapAsk(
    `Spend cap can't be enforced (SAFE-8): model "${shown}" has no known price, so I can't ` +
      `count it against ${cap} and stopped before calling ` +
      `the provider. ${stoppedAt([spendScopeLabel(scope)])} To continue, the operator switches ${modelKey} to a priced model ` +
      `or ${unset} ${OPERATOR_HINT}; then ask again. ${NO_REPLY_NOTE}`,
    [scope],
  );
}

/** The ledger could not be opened or written: the caps cannot be checked. */
export function spendCapLedgerAsk(error: string): HumanAsk {
  const why = scrubSecrets(error).replace(/\s+/g, " ").trim().slice(0, 200) || "unknown error";
  return spendCapAsk(
    `Spend cap can't be enforced (SAFE-8): the spend ledger is unavailable (${why}), so I ` +
      "stopped before calling the provider. To continue, the operator checks the data dir " +
      `(CORVIDINHO_DATA_DIR) or unsets ${SPEND_CAP_ENV} and ${PROVIDER_SPEND_CAPS_ENV} ${OPERATOR_HINT}; then ask again. ` +
      NO_REPLY_NOTE,
  );
}

// ─── doctor / Discord /status (AUTONOMOUS-8, SAFE-14) ──────────────────────

/** One provider's cap and that provider's rolling 24 h spend (SAFE-14). */
export type ProviderSpend = {
  /** The configured provider id (endpoint host) the cap is keyed on. */
  provider: string;
  capMicroUsd: number;
  window: SpendWindow;
};

/** What the ledger says right now, for doctor and /status. */
export type SpendSnapshot =
  | { kind: "off" }
  | {
      kind: "invalid";
      /** The setting(s) whose value is not valid (never the value); default the total cap. */
      keys?: readonly string[];
    }
  | { kind: "unreadable"; error: string }
  | {
      kind: "cap";
      /** The total cap (`CORVIDINHO_DAILY_SPEND_CAP_USD`); absent when only provider caps are set. */
      capMicroUsd?: number;
      /** Rolling 24 h spend over every recorded provider call. */
      window: SpendWindow;
      /** SAFE-14: each provider cap with that provider's spend, by provider id. */
      providers?: readonly ProviderSpend[];
      /**
       * Model price-checked: the configured model (loadLlmEnv().model), or,
       * when it is priced but a per-tier model is not (AGENT-5), that one.
       */
      model: string;
      /** False when calls to `model` stop at the spend check: unpriced and under a cap. */
      priced: boolean;
      /** Set when `model` is the unpriced model of this tier only (AGENT-5). */
      tier?: CapabilityTier;
    };

export type SpendDoctorLine = { ok: true; mark: "ok" | "warn" | "info"; detail: string };

/** A doctor line with its check name (`spend`, `spend provider:<id>`). */
export type NamedSpendDoctorLine = SpendDoctorLine & { name: string };

const STOPS_AND_ASKS = "runs stop and ask before calling the provider";

function unpricedNote(s: { model: string; tier?: CapabilityTier }): string {
  const runs = s.tier ? `${s.tier}-tier runs` : "runs";
  return (
    `model "${scrubSecrets(s.model)}" has no known price, so ${runs} stop and ask before calling the provider ` +
    "(each call on a spend card showing the amount as unknown, SAFE-16.a)"
  );
}

/** ", N counted at its estimate" / ", N at an unknown price" for a doctor line (SAFE-16). */
function windowCounts(w: SpendWindow): string {
  const estimated = w.estimatedCalls ? `, ${w.estimatedCalls} counted at its estimate` : "";
  const unknown = w.unknownCalls ? `, ${w.unknownCalls} at an unknown price` : "";
  return `${estimated}${unknown}`;
}

/** Doctor `spend` line (the total cap). Informational: `ok` is always true, so it never fails doctor. */
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
        detail: `${invalidSettingText(s.keys)} — ${STOPS_AND_ASKS} until it is fixed or unset (SAFE-8)`,
      };
    case "unreadable":
      return {
        ok: true,
        mark: "warn",
        detail: `spend ledger unreadable: ${scrubSecrets(s.error).slice(0, 200)} — ${STOPS_AND_ASKS} (SAFE-8)`,
      };
    case "cap": {
      const { window: w, capMicroUsd: cap } = s;
      const notes: string[] = [];
      if (cap === undefined) {
        if (!s.priced) notes.push(unpricedNote(s));
        return {
          ok: true,
          mark: notes.length ? "warn" : "info",
          detail:
            `no total daily cap set (${SPEND_CAP_ENV}); provider caps are listed per provider ` +
            `(${PROVIDER_SPEND_CAPS_ENV}, SAFE-14)` +
            (notes.length ? `; ${notes.join("; ")}` : ""),
        };
      }
      const pct = spendPercent(w.spentMicroUsd, cap);
      if (w.spentMicroUsd >= cap) notes.push(`cap reached — ${STOPS_AND_ASKS}`);
      else if (atWarnThreshold(w.spentMicroUsd, cap)) {
        notes.push(`past the ${SPEND_WARN_PERCENT}% warning — a call that would pass the cap stops and asks first`);
      }
      if (!s.priced) notes.push(unpricedNote(s));
      return {
        ok: true,
        mark: notes.length ? "warn" : "ok",
        detail:
          `${formatSpend(w.spentMicroUsd, w.unknownCalls)} of ${formatUsd(cap)} daily cap used in the last 24h ` +
          `(${pct}%; ${w.calls} provider call(s)${windowCounts(w)}; ${SPEND_CAP_ENV}, SAFE-8)` +
          (notes.length ? `; ${notes.join("; ")}` : ""),
      };
    }
  }
}

/** Doctor line for one provider cap (SAFE-14 / SAFE-15). */
export function formatProviderSpendDoctorLine(p: ProviderSpend): NamedSpendDoctorLine {
  const id = shownProvider(p.provider);
  const { window: w, capMicroUsd: cap } = p;
  const pct = spendPercent(w.spentMicroUsd, cap);
  const notes: string[] = [];
  if (w.spentMicroUsd >= cap) notes.push(`cap reached — calls to ${id} stop and ask before they are sent`);
  else if (atWarnThreshold(w.spentMicroUsd, cap)) {
    notes.push(`past the ${SPEND_WARN_PERCENT}% warning — a call that would pass this cap stops and asks first`);
  }
  return {
    name: `spend provider:${id}`,
    ok: true,
    mark: notes.length ? "warn" : "ok",
    detail:
      `${formatSpend(w.spentMicroUsd, w.unknownCalls)} of ${formatUsd(cap)} daily cap for ${id} used in the last 24h ` +
      `(${pct}%; ${w.calls} provider call(s)${windowCounts(w)}; ${PROVIDER_SPEND_CAPS_ENV}, SAFE-14)` +
      (notes.length ? `; ${notes.join("; ")}` : ""),
  };
}

/** Every doctor spend line: `spend` (the total cap), then one per provider cap. */
export function formatSpendDoctorLines(s: SpendSnapshot): NamedSpendDoctorLine[] {
  const lines: NamedSpendDoctorLine[] = [{ name: "spend", ...formatSpendDoctorLine(s) }];
  if (s.kind === "cap") for (const p of s.providers ?? []) lines.push(formatProviderSpendDoctorLine(p));
  return lines;
}

/**
 * True when runs stop and ask at the spend check right now: a cap reached
 * (the total, or any provider's), a covered unpriced model, a bad setting or
 * no ledger.
 */
export function spendPaused(s: SpendSnapshot): boolean {
  switch (s.kind) {
    case "off":
      return false;
    case "invalid":
    case "unreadable":
      return true;
    case "cap":
      return (
        (s.capMicroUsd !== undefined && s.window.spentMicroUsd >= s.capMicroUsd) ||
        (s.providers ?? []).some((p) => p.window.spentMicroUsd >= p.capMicroUsd) ||
        !s.priced
      );
  }
}

/**
 * SAFE-14.a: the `/status` spend line for anyone but the owner — only that
 * work is paused for budget, while it is; otherwise nothing (undefined).
 */
export function formatSpendPublicStatusLine(s: SpendSnapshot): string | undefined {
  return spendPaused(s) ? `Spend: ${SPEND_PAUSED_TEXT}` : undefined;
}

/** One owner `/status` line per provider cap (SAFE-14). */
function providerStatusLine(p: ProviderSpend): string {
  const id = shownProvider(p.provider);
  const { window: w, capMicroUsd: cap } = p;
  const pct = spendPercent(w.spentMicroUsd, cap);
  let line = `Spend (24h) on ${id}: ${formatSpend(w.spentMicroUsd, w.unknownCalls)} of ${formatUsd(cap)} daily cap (${pct}%)`;
  if (w.spentMicroUsd >= cap) line += ` — 🛑 cap reached, calls to ${id} stop and ask`;
  else if (atWarnThreshold(w.spentMicroUsd, cap)) line += ` — ⚠️ past ${SPEND_WARN_PERCENT}%`;
  return line;
}

/**
 * The owner's `/status` spend lines (Discord markdown, no ids, no raw
 * errors): the total cap's line, then one line per provider cap.
 */
export function formatSpendStatusLine(s: SpendSnapshot): string {
  switch (s.kind) {
    case "off":
      return `Spend cap: off (set ${SPEND_CAP_ENV} to track spend)`;
    case "invalid": {
      const keys = s.keys && s.keys.length > 0 ? s.keys : [SPEND_CAP_ENV];
      const what = keys
        .map((k) =>
          k === PROVIDER_SPEND_CAPS_ENV
            ? `${k} is not a comma list of provider=USD for configured providers`
            : `${k} is not a plain USD amount`,
        )
        .join(", and ");
      return `Spend cap: ⚠️ ${what} — runs stop and ask`;
    }
    case "unreadable":
      return "Spend cap: ⚠️ spend ledger unreadable — runs stop and ask";
    case "cap": {
      const { window: w, capMicroUsd: cap } = s;
      let line: string;
      if (cap === undefined) {
        line = `Spend cap (total): off (${SPEND_CAP_ENV}); per-provider caps below`;
      } else {
        const pct = spendPercent(w.spentMicroUsd, cap);
        line = `Spend (24h): ${formatSpend(w.spentMicroUsd, w.unknownCalls)} of ${formatUsd(cap)} daily cap (${pct}%)`;
        if (w.spentMicroUsd >= cap) line += " — 🛑 cap reached, runs stop and ask";
        else if (atWarnThreshold(w.spentMicroUsd, cap)) line += ` — ⚠️ past ${SPEND_WARN_PERCENT}%`;
      }
      if (!s.priced) {
        line += s.tier
          ? ` — ⚠️ ${s.tier}-tier model has no known price, ${s.tier}-tier runs stop and ask (card shows the amount as unknown)`
          : " — ⚠️ model has no known price, runs stop and ask (card shows the amount as unknown)";
      }
      return [line, ...(s.providers ?? []).map(providerStatusLine)].join("\n");
    }
  }
}

/**
 * SAFE-8 / SAFE-14 / SAFE-15 — optional operator-set rolling 24 h spend caps
 * on provider (LLM) calls: a total cap and one cap per provider.
 *
 * Off unless CORVIDINHO_DAILY_SPEND_CAP_USD (the total cap) or
 * CORVIDINHO_PROVIDER_SPEND_CAPS_USD (a comma list of `provider=USD`, keyed on
 * the configured provider id, SAFE-14) is set; every cap is optional. While
 * any cap is set, every OpenAI-compatible chat call is priced from a
 * per-model table, its estimate is reserved against a rolling 24 h ledger in
 * the shared SQLite DB before the request is sent — checked against the total
 * cap (if set) and the call's own provider cap (if set) in one transaction —
 * and the reservation is replaced by the provider-reported cost once the reply
 * arrives. No cap ⇒ the fetch comes back untouched and the DB is never opened
 * (no behavior change).
 *
 * SAFE-8 as amended (#98), SAFE-15 for each cap: at 80% of a cap the run gets
 * one warning per crossing of that cap, recorded in `spend_alerts` across
 * processes and re-armed once that cap's spend is seen back under 70%
 * (spend-alerts.ts); the Discord bridge delivers recorded warnings to the
 * owner (spend-outbox.ts). At 100% of any cap the call is not sent as is.
 * With an owner configured, the guard of a run (`approval` given, as
 * `createTaskExecute` does) holds that one call and asks the owner on a DM
 * Approve card (SAFE-8, AUTONOMY-8; kind `spend`, class `money`, so Approve
 * also needs the SAFE-19 one-time code): the card shows the action (one
 * model call to <model> via <provider>), the target (the tripped scope(s),
 * `total` / `provider:<id>`) and the amount (that call's estimate). Approve
 * plus the code lets exactly that call through at that amount
 * (`SpendLedger.reserveApproved`); the next call past the cap asks again
 * (SAFE-8.a). A deny, no answer in time, a late code, a stop or a card that
 * could not be raised is a no (SAFE-20), and so is no owner (nobody can
 * approve): the guard records a `spend-cap` ask naming the tripped scope(s)
 * and the execute hook ends the attempt with it, so the run stops `blocked`
 * and the owner is told through the AUTONOMY-1/2 path instead of the call
 * being refused or overspent. The stop is thrown as SpendCapRefusal before
 * any request, which is not a model failure: no model fallback (AGENT-11) may
 * route around a cap.
 *
 * Tool calls with a flat price per call (a Brave `web-search`, #318; a
 * free-tier GIPHY `gif-search`, recorded at $0) count toward the same total
 * cap and are recorded while any cap is set:
 * `reserveFlatSpend` reserves the price in the same ledger before the call,
 * and a stopped call hands the tool loop the same `spend-cap` ask
 * (`PluginHandlerResult.spendAsk`, src/agent/execute.ts).
 *
 * Assumptions (see specs/agent REQ-agent-098):
 *  - "Daily" is the last 24 hours (rolling), not a calendar day.
 *  - Prices are standard USD per 1M tokens; cached-input discounts are ignored,
 *    so the count errs high.
 *  - A model missing from the table has no known price: while a cap covers
 *    its call (the total cap, or its provider's cap) it stops and asks —
 *    never counted as free, never guessed. With an owner configured and
 *    `approval` given, it asks on the owner's spend card showing the amount
 *    as unknown (SAFE-16.a): Approve plus the one-time code lets exactly that
 *    call through, recorded with status `unknown` (no amount, never $0;
 *    `SpendWindow.unknownCalls`), and the next such call asks again; any no
 *    stops it with the unpriced ask. Otherwise it stops with the operator
 *    ask. A call no cap covers runs and is not recorded (its cost is unknown,
 *    SAFE-16). There is no price override (SAFE-16.a).
 *  - A provider cap key is the configured provider id (the endpoint host,
 *    `providerId`); a malformed entry, or a key that names no configured
 *    provider, makes the whole setting invalid: every call stops and asks, and
 *    the value is never echoed.
 *  - Pre-call estimate: request bytes / 3 prompt tokens + a 4096-token reply
 *    reserve. A reply longer than the reserve can overshoot the cap by that one
 *    call; the next call then stops and asks.
 *  - Provider omitted `usage` (or the reply was unreadable) ⇒ the estimate stays
 *    counted. HTTP error reply ⇒ counted as 0 (not billed). Network error or
 *    abort ⇒ the estimate stays counted (it may have been billed).
 *  - Several processes (bridge-spawned agents) share one ledger: the check and
 *    the reservation run in one IMMEDIATE transaction, so concurrent calls
 *    cannot both squeeze under the cap.
 *  - Spend cards: one per paused call and at most one open per run (a run's
 *    later paused call waits for its earlier card); another run's open card
 *    never refuses this one. The card stays open {@link SPEND_CARD_TTL_MS},
 *    below the council voice cap, and records its waiting process
 *    (`<pid>:<proc start>`) so the bridge closes a killed run's card as a no.
 *    A CLI-only or daemon-only install (no bridge to DM the card) records the
 *    card all the same and waits out its TTL: no answer is a no and nothing
 *    is spent.
 */

import type { Database } from "bun:sqlite";
import {
  ApprovalStore,
  type ApprovalClass,
  type ApprovalRequest,
} from "../approvals/store.ts";
import { auditContextFromEnv } from "../audit/log.ts";
import { getOwner } from "../identity/owner.ts";
import { scheduleRunnerId } from "../scheduler/store.ts";
import { openCorvidinhoDb } from "../store/db.ts";
import { scrubSecrets } from "../store/scrub.ts";
import { parseModelChain, providerForTier, providerId, resolveEntry } from "./providers.ts";
import { ensureSpendAlerts, rearmSpendAlerts, recordSpendWarning } from "./spend-alerts.ts";
import {
  formatSpend,
  formatSpendDoctorLine,
  formatSpendDoctorLines,
  formatUsd,
  PROVIDER_SPEND_CAPS_ENV,
  providerSpendScope,
  SPEND_CAP_ENV,
  SPEND_CAP_SUMMARY,
  spendCapInvalidAsk,
  spendCapLedgerAsk,
  spendCapReachedAsk,
  spendCapUnpricedAsk,
  spendScopeLabel,
  TOTAL_SPEND_SCOPE,
  type NamedSpendDoctorLine,
  type SpendCardNo,
  type ProviderSpend,
  type SpendDoctorLine,
  type SpendSnapshot,
  type SpendTrip,
} from "./spend-notice.ts";
import { loadTierFromEnv, perTierModels, TIER_MODEL_ENV, type CapabilityTier } from "./tier.ts";
import type {
  AgentTokenUsage,
  ExecuteResult,
  HumanAsk,
  SpendWarning,
} from "./types.ts";

export {
  formatUsd,
  PROVIDER_SPEND_CAPS_ENV,
  SPEND_CAP_ENV,
  SPEND_WARN_PERCENT,
} from "./spend-notice.ts";
export type {
  NamedSpendDoctorLine,
  ProviderSpend,
  SpendDoctorLine,
  SpendSnapshot,
  SpendTrip,
} from "./spend-notice.ts";

export const SPEND_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Reply tokens reserved per call before the provider reports actual usage. */
export const REPLY_RESERVE_TOKENS = 4096;
/** Request bytes per estimated prompt token (low on purpose: errs high). */
export const REQUEST_BYTES_PER_TOKEN = 3;

export type ModelPrice = {
  /** USD per 1M prompt (input) tokens. */
  inputPerMTok: number;
  /** USD per 1M completion (output) tokens, reasoning tokens included. */
  outputPerMTok: number;
};

/**
 * Standard list prices, USD per 1M tokens (no batch / cache discounts).
 * Matched on the exact model id (trimmed, lower-cased): a dated snapshot or a
 * gateway-prefixed id is a different model and counts as unpriced.
 */
export const MODEL_PRICES_USD_PER_MTOK: Readonly<Record<string, ModelPrice>> =
  Object.freeze({
    // OpenAI
    "gpt-4o-mini": { inputPerMTok: 0.15, outputPerMTok: 0.6 },
    "gpt-4o": { inputPerMTok: 2.5, outputPerMTok: 10 },
    "gpt-4.1": { inputPerMTok: 2, outputPerMTok: 8 },
    "gpt-4.1-mini": { inputPerMTok: 0.4, outputPerMTok: 1.6 },
    "gpt-4.1-nano": { inputPerMTok: 0.1, outputPerMTok: 0.4 },
    "gpt-5": { inputPerMTok: 1.25, outputPerMTok: 10 },
    "gpt-5-mini": { inputPerMTok: 0.25, outputPerMTok: 2 },
    "gpt-5-nano": { inputPerMTok: 0.05, outputPerMTok: 0.4 },
    o3: { inputPerMTok: 2, outputPerMTok: 8 },
    "o4-mini": { inputPerMTok: 1.1, outputPerMTok: 4.4 },
    // Anthropic (OpenAI-compatible endpoint)
    "claude-fable-5-1": { inputPerMTok: 10, outputPerMTok: 50 },
    "claude-fable-5": { inputPerMTok: 10, outputPerMTok: 50 },
    "claude-opus-5-5": { inputPerMTok: 4, outputPerMTok: 20 },
    "claude-opus-5": { inputPerMTok: 5, outputPerMTok: 25 },
    "claude-opus-4-8": { inputPerMTok: 5, outputPerMTok: 25 },
    "claude-opus-4-7": { inputPerMTok: 5, outputPerMTok: 25 },
    "claude-opus-4-6": { inputPerMTok: 5, outputPerMTok: 25 },
    "claude-sonnet-5": { inputPerMTok: 2, outputPerMTok: 10 },
    "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
    "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },
  });

/** Known price for a model id, or null when unpriced. */
export function priceForModel(model: string): ModelPrice | null {
  const key = model.trim().toLowerCase();
  return Object.hasOwn(MODEL_PRICES_USD_PER_MTOK, key)
    ? MODEL_PRICES_USD_PER_MTOK[key]
    : null;
}

export type SpendCap =
  | { kind: "off" }
  | { kind: "cap"; capUsd: number; capMicroUsd: number }
  | { kind: "invalid" };

/** A plain USD amount (`5`, `2.50`, `.5`, at most 1e9) in USD, or null. */
function parseUsd(raw: string): number | null {
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(raw)) return null;
  const usd = Number(raw);
  return Number.isFinite(usd) && usd <= 1e9 ? usd : null;
}

/** Read the total cap from env. Empty/unset = off; anything but a plain USD amount = invalid. */
export function parseSpendCap(env: NodeJS.ProcessEnv = process.env): SpendCap {
  const raw = env[SPEND_CAP_ENV]?.trim();
  if (!raw) return { kind: "off" };
  const capUsd = parseUsd(raw);
  if (capUsd === null) return { kind: "invalid" };
  return { kind: "cap", capUsd, capMicroUsd: Math.round(capUsd * 1e6) };
}

/** A provider id as a cap key: a host, `host:port` or `[ipv6]:port`, lower-cased. */
const PROVIDER_KEY_RE = /^[a-z0-9._~\-:\[\]]{1,255}$/;

/**
 * SAFE-14: the syntax of CORVIDINHO_PROVIDER_SPEND_CAPS_USD — comma-separated
 * `provider=USD` entries — as provider id (lower-cased) → cap in micro-USD.
 * Null when any entry is malformed: no `=`, a blank entry or key, a key that
 * is not a host, a duplicate key, or an amount that is not a plain USD amount.
 * Whether each key is a configured provider is checked by parseSpendCaps.
 */
export function parseProviderCapList(raw: string): Map<string, number> | null {
  const out = new Map<string, number>();
  for (const part of raw.split(",")) {
    const entry = part.trim();
    const eq = entry.indexOf("=");
    if (eq <= 0) return null;
    const key = entry.slice(0, eq).trim().toLowerCase();
    const usd = parseUsd(entry.slice(eq + 1).trim());
    if (!PROVIDER_KEY_RE.test(key) || usd === null || out.has(key)) return null;
    out.set(key, Math.round(usd * 1e6));
  }
  return out;
}

/**
 * The provider ids of every configured model entry (AGENT-13):
 * `CORVIDINHO_LLM_MODEL` and the per-tier keys, every entry of each list
 * (the fallback chain included), as `providerId` gives them — what the
 * ledger records for a call to that entry (the request URL's host).
 */
export function configuredProviderIds(env: NodeJS.ProcessEnv): Set<string> {
  const ids = new Set<string>();
  for (const key of ["CORVIDINHO_LLM_MODEL", ...Object.values(TIER_MODEL_ENV)]) {
    for (const entry of parseModelChain(env[key])) {
      ids.add(providerId(resolveEntry(entry, env)).toLowerCase());
    }
  }
  return ids;
}

/** Every spend cap (SAFE-8 total, SAFE-14 per provider). */
export type SpendCaps =
  | { kind: "off" }
  /** A setting is set but not valid: every call stops and asks. `keys` names it (never the value). */
  | { kind: "invalid"; keys: string[] }
  | {
      kind: "caps";
      /** The total cap, or null when only provider caps are set. */
      totalMicroUsd: number | null;
      /** Provider id → its cap (empty when only the total cap is set). */
      providers: ReadonlyMap<string, number>;
    };

/**
 * Read every cap from env (SAFE-14). Both settings unset or blank = off. The
 * total must be a plain USD amount; the provider list must parse
 * (parseProviderCapList) and every key must be a configured provider id
 * (configuredProviderIds). Any problem makes that whole setting invalid,
 * which stops every call (fail closed).
 */
export function parseSpendCaps(env: NodeJS.ProcessEnv = process.env): SpendCaps {
  const total = parseSpendCap(env);
  const bad: string[] = [];
  if (total.kind === "invalid") bad.push(SPEND_CAP_ENV);
  let providers: ReadonlyMap<string, number> = new Map();
  const raw = env[PROVIDER_SPEND_CAPS_ENV]?.trim();
  if (raw) {
    const list = parseProviderCapList(raw);
    const known = list ? configuredProviderIds(env) : null;
    if (!list || [...list.keys()].some((k) => !known?.has(k))) bad.push(PROVIDER_SPEND_CAPS_ENV);
    else providers = list;
  }
  if (bad.length > 0) return { kind: "invalid", keys: bad };
  if (total.kind === "off" && providers.size === 0) return { kind: "off" };
  return { kind: "caps", totalMicroUsd: total.kind === "cap" ? total.capMicroUsd : null, providers };
}

/** USD/MTok equals micro-USD per token; ×1000 gives integer nano-USD per token. */
function nanoPerToken(usdPerMTok: number): number {
  return Math.round(usdPerMTok * 1000);
}

function tokensToMicroUsd(price: ModelPrice, prompt: number, completion: number): number {
  const nano =
    prompt * nanoPerToken(price.inputPerMTok) +
    completion * nanoPerToken(price.outputPerMTok);
  return Math.ceil(nano / 1000);
}

/**
 * Cost of provider-reported usage in micro-USD (rounded up). Tokens reported
 * only in the total (no prompt/completion split) count at the output rate.
 */
export function costMicroUsd(price: ModelPrice, usage: AgentTokenUsage): number {
  const split = usage.promptTokens + usage.completionTokens;
  const unsplit = Math.max(0, usage.totalTokens - split);
  return tokensToMicroUsd(price, usage.promptTokens, usage.completionTokens + unsplit);
}

/** Pre-call estimate in micro-USD: prompt from request size + reply reserve. */
export function estimateCallMicroUsd(price: ModelPrice, requestBytes: number): number {
  const prompt = Math.ceil(Math.max(0, requestBytes) / REQUEST_BYTES_PER_TOKEN);
  return tokensToMicroUsd(price, prompt, REPLY_RESERVE_TOKENS);
}

const SPEND_LEDGER_SQL = `
CREATE TABLE IF NOT EXISTS spend_ledger (
  id TEXT PRIMARY KEY NOT NULL,
  ts INTEGER NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  estimate_micro_usd INTEGER NOT NULL,
  cost_micro_usd INTEGER NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  settled_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_spend_ledger_ts ON spend_ledger(ts);
CREATE INDEX IF NOT EXISTS idx_spend_ledger_provider_ts ON spend_ledger(provider, ts);
`;

/**
 * Create the ledger and alert tables in the shared DB (idempotent; no schema
 * version bump). `spend_alerts` holds only constant kinds and integers.
 */
export function ensureSpendLedger(db: Database): void {
  db.exec(SPEND_LEDGER_SQL);
  ensureSpendAlerts(db);
}

/**
 * reserved → in flight; actual → provider usage; estimated → no usage,
 * estimate kept; failed → HTTP error, 0; unknown → a call at an unknown price
 * the owner approved on a spend card (SAFE-16.a): no amount (cost 0 in the
 * sum, never shown as $0), counted in `unknownCalls`.
 */
export type SpendStatus = "reserved" | "actual" | "estimated" | "failed" | "unknown";

export type SpendSettlement =
  | { status: "actual"; usage: AgentTokenUsage; costMicroUsd: number }
  | { status: "estimated" }
  | { status: "failed" }
  /** A call at an unknown price went out: its row stays `unknown`, with its token usage when reported. */
  | { status: "unknown"; usage: AgentTokenUsage | null };

export type SpendWindow = {
  /** Priced spend (calls at an unknown price add nothing here; see `unknownCalls`). */
  spentMicroUsd: number;
  /** Provider calls counted in the window (HTTP-failed calls excluded). */
  calls: number;
  /** Calls still counted at their estimate (in flight or no usage reported). */
  estimatedCalls: number;
  /**
   * SAFE-16: calls at an unknown price in the window (approved on a spend
   * card, SAFE-16.a). While above 0 the spend reads "$X + unknown".
   */
  unknownCalls: number;
};

/** One call to check against the caps and reserve (SpendLedger.reserve). */
export type SpendReserveInput = {
  provider: string;
  model: string;
  estimateMicroUsd: number;
  /** The total cap; omitted = no total cap. */
  capMicroUsd?: number;
  /** SAFE-14: this call's provider cap; omitted = none. */
  providerCapMicroUsd?: number;
  now: number;
};

/** A priced call the guard checks (and may hold for a spend card). */
type PausedCall = Omit<SpendReserveInput, "now">;

export type SpendReservation =
  | { ok: true; id: string; spentMicroUsd: number }
  | {
      ok: false;
      /** The first tripped cap's spend. */
      spentMicroUsd: number;
      /** Every cap the call would pass: `total` first, then `provider:<id>` (SAFE-15). */
      trips: SpendTrip[];
    };

/** A trip with its scope's unknown-price call count, when there are any (SAFE-16). */
function withUnknown(t: SpendTrip, unknownCalls: number): SpendTrip {
  return unknownCalls > 0 ? { ...t, unknownCalls } : t;
}

/** Rolling 24 h spend ledger over the shared DB. */
export class SpendLedger {
  constructor(private readonly db: Database) {
    ensureSpendLedger(db);
  }

  /**
   * Spend counted in the 24 h window ending at `now`: every provider's, or
   * with `provider` only that provider's calls (SAFE-14; compared as stored,
   * scrubbed).
   */
  window(now: number, provider?: string): SpendWindow {
    const byProvider = provider !== undefined;
    const row = this.db
      .query(
        `SELECT COALESCE(SUM(cost_micro_usd), 0) AS spent,
                COALESCE(SUM(CASE WHEN status != 'failed' THEN 1 ELSE 0 END), 0) AS calls,
                COALESCE(SUM(CASE WHEN status IN ('reserved', 'estimated') THEN 1 ELSE 0 END), 0) AS estimated,
                COALESCE(SUM(CASE WHEN status = 'unknown' THEN 1 ELSE 0 END), 0) AS unknown
           FROM spend_ledger WHERE ${byProvider ? "provider = ? AND " : ""}ts > ?`,
      )
      .get(
        ...(byProvider
          ? [scrubSecrets(provider), now - SPEND_WINDOW_MS]
          : [now - SPEND_WINDOW_MS]),
      ) as { spent: number; calls: number; estimated: number; unknown: number };
    return {
      spentMicroUsd: row.spent,
      calls: row.calls,
      estimatedCalls: row.estimated,
      unknownCalls: row.unknown,
    };
  }

  /**
   * Atomically check the caps and reserve the estimate (one IMMEDIATE
   * transaction). Refuses (no row) when window spend + estimate would exceed
   * the total cap (`capMicroUsd`, if given) or this call's provider cap
   * (`providerCapMicroUsd` against that provider's window, if given), and
   * names every tripped scope. With neither cap the call is just recorded.
   * Spend seen back under a cap's re-arm level re-arms that cap's 80% warning
   * and cap ping (spend-alerts.ts).
   */
  reserve(opts: SpendReserveInput): SpendReservation {
    const run = this.db.transaction((): SpendReservation => {
      const { spentMicroUsd, trips } = this.fit(opts);
      if (trips.length > 0) return { ok: false, spentMicroUsd: trips[0]!.spentMicroUsd, trips };
      return { ok: true, id: this.insertReservation(opts), spentMicroUsd };
    });
    return run.immediate();
  }

  /**
   * SAFE-8.a: reserve exactly one call the owner approved on a spend card,
   * at the amount the card showed, even past a cap (one IMMEDIATE
   * transaction). The fit check runs again first — re-arming a cap seen back
   * under its re-arm level, as {@link reserve} does — and `trips` names the
   * caps the call still passes (empty when it fits now). The row is recorded
   * at `estimateMicroUsd`, and settles like any other call. No row (`ok:
   * false`) when that is not the call the card showed (SAFE-18 / SAFE-19: an
   * approval counts only for the action the card showed): the estimate is
   * over `approvedMicroUsd` (`reason: "amount"`), or the call would now also
   * pass a cap outside `approvedScopes`, the target the card showed (`reason:
   * "target"`, `trips` naming every cap it now passes) — e.g. other runs
   * pushed the total past its cap while a provider cap's card was open. One
   * approval, one row: the next call past the cap is checked by
   * {@link reserve} again.
   */
  reserveApproved(
    opts: SpendReserveInput & {
      /** The amount the card showed (this call's estimate when it paused). */
      approvedMicroUsd: number;
      /** The cap scopes the card showed as its target (`total`, `provider:<id>`). */
      approvedScopes: readonly string[];
    },
  ):
    | { ok: true; id: string; spentMicroUsd: number; trips: SpendTrip[] }
    | { ok: false; reason: "amount" | "target"; trips: SpendTrip[] } {
    if (!(opts.estimateMicroUsd <= opts.approvedMicroUsd)) return { ok: false, reason: "amount", trips: [] };
    const approved = new Set(opts.approvedScopes);
    const run = this.db.transaction(() => {
      const { spentMicroUsd, trips } = this.fit(opts);
      if (trips.some((t) => !approved.has(t.scope))) return { ok: false as const, reason: "target" as const, trips };
      return { ok: true as const, id: this.insertReservation(opts), spentMicroUsd, trips };
    });
    return run.immediate();
  }

  /** Spend against each cap given and the caps the estimate would pass (inside a transaction). */
  private fit(opts: SpendReserveInput): { spentMicroUsd: number; trips: SpendTrip[] } {
    const { spentMicroUsd, unknownCalls } = this.window(opts.now);
    const trips: SpendTrip[] = [];
    if (opts.capMicroUsd !== undefined) {
      rearmSpendAlerts(this.db, { spentMicroUsd, capMicroUsd: opts.capMicroUsd, now: opts.now });
      if (spentMicroUsd + opts.estimateMicroUsd > opts.capMicroUsd) {
        trips.push(withUnknown({ scope: TOTAL_SPEND_SCOPE, spentMicroUsd, capMicroUsd: opts.capMicroUsd }, unknownCalls));
      }
    }
    if (opts.providerCapMicroUsd !== undefined) {
      const cap = opts.providerCapMicroUsd;
      const w = this.window(opts.now, opts.provider);
      const scope = providerSpendScope(scrubSecrets(opts.provider));
      rearmSpendAlerts(this.db, { spentMicroUsd: w.spentMicroUsd, capMicroUsd: cap, now: opts.now, scope });
      if (w.spentMicroUsd + opts.estimateMicroUsd > cap) {
        trips.push(withUnknown({ scope, spentMicroUsd: w.spentMicroUsd, capMicroUsd: cap }, w.unknownCalls));
      }
    }
    return { spentMicroUsd, trips };
  }

  /**
   * SAFE-16.a: the caps that cover a call at an unknown price — the total cap
   * (if given) and the call's provider cap (if given), `total` first — each
   * with its 24 h spend, for the owner's spend card. Nothing is checked or
   * recorded (there is no amount to fit).
   */
  covering(opts: Omit<SpendReserveInput, "estimateMicroUsd" | "model">): SpendTrip[] {
    const out: SpendTrip[] = [];
    if (opts.capMicroUsd !== undefined) {
      const w = this.window(opts.now);
      out.push(withUnknown({ scope: TOTAL_SPEND_SCOPE, spentMicroUsd: w.spentMicroUsd, capMicroUsd: opts.capMicroUsd }, w.unknownCalls));
    }
    if (opts.providerCapMicroUsd !== undefined) {
      const w = this.window(opts.now, opts.provider);
      out.push(
        withUnknown(
          {
            scope: providerSpendScope(scrubSecrets(opts.provider)),
            spentMicroUsd: w.spentMicroUsd,
            capMicroUsd: opts.providerCapMicroUsd,
          },
          w.unknownCalls,
        ),
      );
    }
    return out;
  }

  /**
   * SAFE-16.a: record exactly one call at an unknown price that the owner
   * approved on a spend card: one `unknown` row (no amount: estimate and cost
   * 0, so it never counts as spend — it is counted in `unknownCalls` and
   * shown as "+ unknown", never as $0). Settles like any other call (an HTTP
   * error makes it `failed`).
   */
  recordUnknown(opts: { provider: string; model: string; now: number }): string {
    const id = crypto.randomUUID();
    this.db.run(
      `INSERT INTO spend_ledger
         (id, ts, provider, model, status, estimate_micro_usd, cost_micro_usd)
       VALUES (?, ?, ?, ?, 'unknown', 0, 0)`,
      [id, opts.now, scrubSecrets(opts.provider), scrubSecrets(opts.model)],
    );
    return id;
  }

  /** Record one `reserved` row at the estimate (inside a transaction). */
  private insertReservation(opts: SpendReserveInput): string {
    const id = crypto.randomUUID();
    this.db.run(
      `INSERT INTO spend_ledger
         (id, ts, provider, model, status, estimate_micro_usd, cost_micro_usd)
       VALUES (?, ?, ?, ?, 'reserved', ?, ?)`,
      [
        id,
        opts.now,
        scrubSecrets(opts.provider),
        scrubSecrets(opts.model),
        opts.estimateMicroUsd,
        opts.estimateMicroUsd,
      ],
    );
    return id;
  }

  /**
   * SAFE-8 / SAFE-15 80% warning, once per crossing of a cap: when that
   * cap's 24 h spend is at or past the threshold and the warning for this
   * cap (scope and value) is armed, record one undelivered `warn` row and
   * return it; under the re-arm level, re-arm. Without `provider` the cap is
   * the total cap; with it, that provider's cap against its own spend
   * (SAFE-14), and the warning carries its `provider:<id>` scope. Armed = no
   * warning for this cap since the last re-arm and within 24 h, so a new
   * crossing or a new cap value warns again. Check and insert share one
   * IMMEDIATE transaction, so concurrent processes warn once between them. A
   * zero cap never warns (nothing is spent).
   */
  noteWarning(opts: { capMicroUsd: number; now: number; provider?: string }): SpendWarning | null {
    const run = this.db.transaction((): SpendWarning | null => {
      const { spentMicroUsd, unknownCalls } = this.window(opts.now, opts.provider);
      const w = recordSpendWarning(this.db, {
        spentMicroUsd,
        capMicroUsd: opts.capMicroUsd,
        now: opts.now,
        ...(opts.provider !== undefined
          ? { scope: providerSpendScope(scrubSecrets(opts.provider)) }
          : {}),
      });
      // SAFE-16: the warning's spend reads "$X + unknown" while the window holds such a call.
      return w && unknownCalls > 0 ? { ...w, unknownCalls } : w;
    });
    return run.immediate();
  }

  /** Replace a reservation with what the call actually cost. */
  settle(id: string, s: SpendSettlement, now: number): void {
    if (s.status === "unknown") {
      // SAFE-16: still no price — keep the row `unknown`, with its tokens.
      this.db.run(
        `UPDATE spend_ledger SET prompt_tokens = ?, completion_tokens = ?, settled_at = ? WHERE id = ?`,
        [s.usage?.promptTokens ?? null, s.usage?.completionTokens ?? null, now, id],
      );
    } else if (s.status === "actual") {
      this.db.run(
        `UPDATE spend_ledger SET status = 'actual', cost_micro_usd = ?,
           prompt_tokens = ?, completion_tokens = ?, settled_at = ? WHERE id = ?`,
        [s.costMicroUsd, s.usage.promptTokens, s.usage.completionTokens, now, id],
      );
    } else if (s.status === "failed") {
      this.db.run(
        `UPDATE spend_ledger SET status = 'failed', cost_micro_usd = 0, settled_at = ? WHERE id = ?`,
        [now, id],
      );
    } else {
      this.db.run(
        `UPDATE spend_ledger SET status = 'estimated', settled_at = ? WHERE id = ?`,
        [now, id],
      );
    }
  }
}

/**
 * Thrown by the capped fetch instead of sending a call that would pass the
 * cap (or cannot be counted). Carries the `spend-cap` ask; the execute hook
 * turns it into a blocked run (see SpendGuard.finish).
 */
export class SpendCapRefusal extends Error {
  override name = "SpendCapRefusal";
  constructor(readonly ask: HumanAsk) {
    super(ask.question);
  }
}

export type SpendFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type SpendCapOptions = {
  env?: NodeJS.ProcessEnv;
  /** Reads provider-reported usage from the parsed JSON reply (execute's extractUsage). */
  readUsage: (data: unknown) => AgentTokenUsage | null;
  /**
   * SAFE-8 80% warning, called at most once per crossing (deduped in the
   * ledger). Without a listener no warning is recorded.
   */
  onWarning?: (warning: SpendWarning) => void;
  /**
   * Env key that sets the run's model (AGENT-5, modelKeyForTier), named in the
   * unpriced-model ask. Default `CORVIDINHO_LLM_MODEL`.
   */
  modelKey?: string;
  /** Test seam: ledger DB. Default: shared DB under CORVIDINHO_DATA_DIR, opened on first call. */
  db?: Database;
  now?: () => number;
  /**
   * SAFE-8 / SAFE-8.a: ask the owner on a spend Approve card for a priced
   * call past a cap instead of stopping at once. Omitted ⇒ the stop asks as
   * before (the operator-action ask).
   */
  approval?: SpendApprovalOptions;
};

/** What a run tells the spend card about itself (createTaskExecute). */
export type SpendApprovalOptions = {
  /** The run's task text, shown to the owner before the card (as data). */
  taskText?: string;
  /** The project as a label (never a host path), read only when a card is raised. */
  project?: () => string | undefined;
  /** The run's one-line notes: the "waiting for the owner's OK" line and the outcome (Text events). */
  onNote?: (line: string) => void;
};

/** SAFE-8 / SAFE-19: the spend card's kind on the Approve card engine. */
export const SPEND_CARD_KIND = "spend";
/** Spending past a cap is a money action: Approve also needs the one-time code (SAFE-19). */
export const SPEND_CARD_CLASS: ApprovalClass = "money";
/**
 * How long a spend card stays open (no answer by then ⇒ no, SAFE-20). Below
 * the council voice cap (COUNCIL_VOICE_TIMEOUT_MS, 5 min) and the per-request
 * LLM timeout (LLM_REQUEST_TIMEOUT_MS, 10 min) that wrap a waiting call.
 */
export const SPEND_CARD_TTL_MS = 4 * 60 * 1000;
/** How often the waiting run reads the card's decision from the shared DB. */
export const SPEND_CARD_POLL_MS = 1000;
/** Most task-text characters shown before a spend card (the rest is marked cut). */
export const SPEND_CARD_TASK_MAX = 1500;

/** Test seams: a short card lifetime and poll, and a hook right after a card is recorded. */
export type SpendCardTestHooks = {
  ttlMs?: number;
  pollMs?: number;
  onRequest?: (req: ApprovalRequest, db: Database) => void;
};

let spendCardHooks: SpendCardTestHooks = {};

/** Tests only: set (or clear with `{}`) the spend card's seams. Returns the previous ones. */
export function setSpendCardTestHooks(hooks: SpendCardTestHooks): SpendCardTestHooks {
  const prev = spendCardHooks;
  spendCardHooks = hooks;
  return prev;
}

/**
 * The owner lookup for a spend card: `env`, whose allowlist file is this
 * process's when `env` names none (a caller's own env object never falls
 * back to the home directory's file while the process names one).
 */
function ownerEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const own = env.CORVIDINHO_ALLOWLIST_FILE?.trim();
  const proc = process.env.CORVIDINHO_ALLOWLIST_FILE?.trim();
  return own || !proc ? env : { ...env, CORVIDINHO_ALLOWLIST_FILE: proc };
}

function shortLine(text: string, max: number): string {
  const one = text.replace(/\s*\n\s*/g, " ").trim();
  return one.length <= max ? one : `${one.slice(0, max - 1)}…`;
}

/**
 * The task text shown before a card: SAFE-6 scrubbed first, then at most
 * SPEND_CARD_TASK_MAX characters, a cut marked — scrubbing after the cut could
 * leave the start of a secret the cut split unrecognised (SAFE-6.a).
 */
function taskExcerpt(task: string): string {
  const t = scrubSecrets(task).trim();
  if (t.length <= SPEND_CARD_TASK_MAX) return t;
  return `${t.slice(0, SPEND_CARD_TASK_MAX)}\n[… ${t.length - SPEND_CARD_TASK_MAX} more characters not shown]`;
}

/**
 * SAFE-16.a: the start of a spend card's amount when the call's price is
 * unknown (the card engine's outcome line and tests key on it).
 */
export const SPEND_CARD_UNKNOWN_AMOUNT = "unknown";

/** True for a spend card whose amount is unknown (SAFE-16.a). */
export function isUnknownSpendAmount(amount: string | undefined): boolean {
  return (amount ?? "").startsWith(SPEND_CARD_UNKNOWN_AMOUNT);
}

/**
 * What a spend card shows (SAFE-18): the paused call, the tripped cap(s),
 * that call's estimate. With `estimateMicroUsd` null (SAFE-16.a: the model
 * has no known price) the target is every cap that covers the call and the
 * amount is shown as unknown, never as $0.
 */
export function spendCardFields(o: {
  model: string;
  provider: string;
  estimateMicroUsd: number | null;
  trips: readonly SpendTrip[];
  surface: string;
  requester: string;
  project?: string;
  taskText?: string;
}): { title: string; action: string; target: string; amount: string; text: string } {
  const provider = scrubSecrets(o.provider).replace(/\s+/g, "") || "(unknown)";
  const model = scrubSecrets(o.model).replace(/\s+/g, " ").trim() || "(none)";
  const unknown = o.estimateMicroUsd === null;
  const context = [
    `Asked by ${o.requester} on ${o.surface}${o.project ? `, project ${o.project}` : ""}.`,
    `24h spend when it paused: ${o.trips
      .map((t) => `${spendScopeLabel(t.scope)} ${formatSpend(t.spentMicroUsd, t.unknownCalls)} of ${formatUsd(t.capMicroUsd)}`)
      .join("; ")}.`,
    unknown
      ? "This model has no known price, so this call's cost is unknown: it is never counted as $0. Approve " +
        "lets only this one call through; the next call at an unknown price asks again (SAFE-16.a)."
      : "Approve lets only this one call through, at this amount; the next call past the cap asks again (SAFE-8.a).",
  ];
  const task = o.taskText?.trim();
  return {
    title: shortLine(
      unknown
        ? `Spend at an unknown price — asks first (SAFE-16.a) · from ${o.surface}`
        : `Spend past a cap — asks first (SAFE-8) · from ${o.surface}`,
      100,
    ),
    action: shortLine(`send one model call to ${model} via ${provider}`, 500),
    target: shortLine(o.trips.map((t) => spendScopeLabel(t.scope)).join(", "), 500),
    amount:
      o.estimateMicroUsd === null
        ? `${SPEND_CARD_UNKNOWN_AMOUNT} (no known price for this model; never counted as free)`
        : `~${formatUsd(o.estimateMicroUsd)} (this one call's estimate)`,
    text: [...context, ...(task ? ["", "Task:", taskExcerpt(task)] : [])].join("\n"),
  };
}

function modelFromRequestBody(body: string): string {
  try {
    const m = (JSON.parse(body) as { model?: unknown }).model;
    return typeof m === "string" ? m : "";
  } catch {
    return "";
  }
}

function providerOf(input: string | URL | Request): string {
  try {
    const url = input instanceof Request ? input.url : String(input);
    return new URL(url).host || "unknown";
  } catch {
    return "unknown";
  }
}

/** Capped fetch plus the ask it stopped on, for the execute hook. */
export type SpendGuard = {
  /** The provider fetch; `fetchImpl` itself when no cap is set. */
  fetch: SpendFetch;
  /**
   * When a call was stopped at the cap during this attempt, replace the
   * attempt's result with the `spend-cap` ask (the generic
   * SPEND_CAP_SUMMARY as summary — safe for a public reply — the details in
   * `ask.question`, filesChanged kept), so the run ends `blocked` instead of
   * reporting a failed call. Clears the ask.
   */
  finish(result: ExecuteResult): ExecuteResult;
};

/**
 * Wrap the provider fetch with the SAFE-8 / SAFE-14 caps. No cap ⇒ `fetch` is
 * `fetchImpl` itself and nothing else happens. With any cap set, every call
 * is recorded, and a call that would pass the total cap or its provider's cap
 * (or cannot be counted: an invalid setting, an unpriced model under a cap
 * that covers it, ledger unavailable) throws SpendCapRefusal before any
 * request is sent and leaves its ask for `finish`. An unpriced model's call
 * that no cap covers (no total cap, no cap for its provider) is sent
 * unrecorded: its cost is unknown, never counted as free (SAFE-16).
 *
 * With `approval` given and an owner configured, a priced call past a cap
 * is held instead: it waits (one card at a time per guard) for the owner's
 * `spend` card and is sent only on an approval it uses once, recorded at the
 * estimate the card showed (`reserveApproved`); every later call is checked
 * again (SAFE-8.a). A no throws SpendCapRefusal whose ask says what the card
 * came to. The call's own abort signal ends the wait (the card closes as a
 * no). An unpriced model's call under a cap that covers it asks the same way
 * on a card whose amount is unknown (SAFE-16.a): approved, it is sent and
 * recorded `unknown` (never $0); a no stops it with the unpriced ask.
 * Invalid-setting and ledger stops never raise a card.
 */
export function createSpendGuard(fetchImpl: SpendFetch, opts: SpendCapOptions): SpendGuard {
  const env = opts.env ?? process.env;
  const caps = parseSpendCaps(env);
  if (caps.kind === "off") return { fetch: fetchImpl, finish: (r) => r };
  const now = opts.now ?? Date.now;
  let db: Database | undefined;
  let ledger: SpendLedger | undefined;
  let pending: HumanAsk | null = null;
  /** This run's spend cards, one at a time: at most one open per run. */
  let cardTurn: Promise<unknown> = Promise.resolve();

  const stop = (ask: HumanAsk): never => {
    pending = ask;
    throw new SpendCapRefusal(ask);
  };

  const note = (line: string) => {
    try {
      opts.approval?.onNote?.(scrubSecrets(line));
    } catch {
      // A note never changes what the guard does.
    }
  };

  /** The configured owner (nobody can approve a card without one). */
  const ownerConfigured = async (): Promise<boolean> => {
    try {
      return Boolean(await getOwner({ env: ownerEnv(env) }));
    } catch {
      return false;
    }
  };

  /**
   * Record one spend card (SAFE-18: kind `spend`, class `money`, so Approve
   * also needs the SAFE-19 one-time code) and wait for it: `approved` only
   * when the owner approved it and the approval was used once while the
   * call's signal was not aborted; otherwise how it came to no (SAFE-20).
   * `what` names the call in the wait note (no amounts). Never throws.
   */
  const waitOnCard = async (
    fields: ReturnType<typeof spendCardFields>,
    what: string,
    signal: AbortSignal | undefined,
  ): Promise<{ approved: true; requestId: string } | { approved: false; card: SpendCardNo }> => {
    let requestId: string | undefined;
    try {
      const store = new ApprovalStore({ db: db! });
      const { actor } = auditContextFromEnv(env);
      const req = store.request({
        kind: SPEND_CARD_KIND,
        class: SPEND_CARD_CLASS,
        ...fields,
        textLabel: "text",
        requester: actor,
        waiter: scheduleRunnerId(),
        ttlMs: spendCardHooks.ttlMs ?? SPEND_CARD_TTL_MS,
      });
      requestId = req.id;
      note(
        `[operator] AUTONOMY-8: waiting for the owner's OK on an Approve card with the one-time code ` +
          `(${what}; request ${req.id}; no answer by ` +
          `${new Date(req.expiresAt).toISOString()} means no, and nothing is spent — the running Discord ` +
          "bridge DMs the card to the owner; with no bridge running it lapses).",
      );
      spendCardHooks.onRequest?.(req, db!);
      const decided = await store.waitForDecision(req.id, {
        pollMs: spendCardHooks.pollMs ?? SPEND_CARD_POLL_MS,
        ...(signal ? { signal } : {}),
      });
      // A stop that lands as the owner approves wins: the approval is left unused.
      if (decided?.status === "approved" && !signal?.aborted && store.consume(req.id)) {
        return { approved: true, requestId: req.id };
      }
      return {
        approved: false,
        card: {
          requestId,
          outcome: decided?.status === "denied" ? "denied" : signal?.aborted ? "aborted" : "expired",
        },
      };
    } catch (err) {
      return {
        approved: false,
        card: {
          ...(requestId ? { requestId } : {}),
          outcome: "unavailable",
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  };

  /** The run's project label for a card, read only when a card is raised. */
  const projectForCard = (): string | undefined => {
    try {
      return opts.approval?.project?.();
    } catch {
      return undefined;
    }
  };

  /** Card fields for this run (who asked, where, the project and the task as data). */
  const cardFields = (o: { model: string; provider: string; estimateMicroUsd: number | null; trips: SpendTrip[] }) => {
    const { actor, surface } = auditContextFromEnv(env);
    const project = projectForCard();
    return spendCardFields({
      ...o,
      surface,
      requester: actor,
      ...(project ? { project } : {}),
      ...(opts.approval?.taskText ? { taskText: opts.approval.taskText } : {}),
    });
  };

  /**
   * SAFE-8 / SAFE-8.a / SAFE-19: a priced call past a cap waits for the
   * owner's spend card. Resolves the reservation of exactly that call when
   * the owner approved it (Approve + one-time code) and the approval was used
   * once; throws SpendCapRefusal on a no — deny, no answer in time or a late
   * code (SAFE-20), a stop while waiting, no owner configured (nobody can
   * approve: the operator-action ask) or a card that could not be raised.
   */
  const passOnCard = async (
    call: PausedCall,
    trips: SpendTrip[],
    signal: AbortSignal | undefined,
  ): Promise<string> => {
    const reached = (card?: SpendCardNo) =>
      stop(spendCapReachedAsk({ estimateMicroUsd: call.estimateMicroUsd, trips, ...(card ? { card } : {}) }));
    if (!opts.approval) return reached();
    if (!(await ownerConfigured())) return reached();
    if (signal?.aborted) return reached({ outcome: "aborted" });
    const turn = cardTurn.then(async (): Promise<string> => {
      // Re-fit first: the window may have moved while an earlier card of
      // this run was open (or the call was checked a moment ago).
      let again: SpendReservation;
      try {
        again = ledger!.reserve({ ...call, now: now() });
      } catch (err) {
        return stop(spendCapLedgerAsk(err instanceof Error ? err.message : String(err)));
      }
      if (again.ok) return again.id;
      trips = again.trips;
      if (signal?.aborted) return reached({ outcome: "aborted" });
      let fields: ReturnType<typeof spendCardFields>;
      try {
        fields = cardFields({ model: call.model, provider: call.provider, estimateMicroUsd: call.estimateMicroUsd, trips });
      } catch (err) {
        return reached({ outcome: "unavailable", error: err instanceof Error ? err.message : String(err) });
      }
      const waited = await waitOnCard(fields, "one model call past a spend cap, SAFE-8.a", signal);
      if (!waited.approved) return reached(waited.card);
      let passed: ReturnType<SpendLedger["reserveApproved"]>;
      try {
        passed = ledger!.reserveApproved({
          ...call,
          approvedMicroUsd: call.estimateMicroUsd,
          approvedScopes: trips.map((t) => t.scope),
          now: now(),
        });
      } catch (err) {
        return reached({
          requestId: waited.requestId,
          outcome: "unavailable",
          error: err instanceof Error ? err.message : String(err),
        });
      }
      if (!passed.ok) {
        // Not the call the card showed (it would now pass a cap the card
        // did not name): the used approval does not stretch to it.
        if (passed.trips.length > 0) trips = passed.trips;
        return reached({ requestId: waited.requestId, outcome: "changed" });
      }
      note(
        `[operator] AUTONOMY-8: the owner approved request ${waited.requestId}; sending that one call ` +
          "(SAFE-8.a: the next call past the cap asks again).",
      );
      return passed.id;
    });
    cardTurn = turn.catch(() => undefined);
    return turn;
  };

  /**
   * SAFE-16.a: a call whose model has no known price, under a cap that
   * covers it (the total cap and/or its provider's cap), stops and asks on
   * the owner's spend card with the amount shown as unknown. Resolves the
   * id of its `unknown` ledger row when the owner approved that one call
   * (Approve + one-time code, used once); throws SpendCapRefusal with the
   * unpriced ask otherwise — no `approval` hook or no owner (the operator
   * ask at once, before the ledger opens), or the card came to no (the ask
   * names the card). One card at a time per run, like priced cards. There
   * is no price override.
   */
  const passUnknownOnCard = async (
    call: { provider: string; model: string; capMicroUsd?: number; providerCapMicroUsd?: number },
    signal: AbortSignal | undefined,
  ): Promise<string> => {
    const scope =
      call.capMicroUsd !== undefined ? TOTAL_SPEND_SCOPE : providerSpendScope(scrubSecrets(call.provider));
    const cap = call.capMicroUsd ?? call.providerCapMicroUsd!;
    const unpriced = (card?: SpendCardNo) =>
      stop(spendCapUnpricedAsk(call.model, cap, opts.modelKey, scope, card));
    if (!opts.approval) return unpriced();
    if (!(await ownerConfigured())) return unpriced();
    try {
      db ??= opts.db ?? openCorvidinhoDb({ env });
      ledger ??= new SpendLedger(db);
    } catch (err) {
      return stop(spendCapLedgerAsk(err instanceof Error ? err.message : String(err)));
    }
    if (signal?.aborted) return unpriced({ outcome: "aborted" });
    const turn = cardTurn.then(async (): Promise<string> => {
      if (signal?.aborted) return unpriced({ outcome: "aborted" });
      let fields: ReturnType<typeof spendCardFields>;
      try {
        const trips = ledger!.covering({ ...call, now: now() });
        fields = cardFields({ model: call.model, provider: call.provider, estimateMicroUsd: null, trips });
      } catch (err) {
        return unpriced({ outcome: "unavailable", error: err instanceof Error ? err.message : String(err) });
      }
      const waited = await waitOnCard(fields, "one model call at an unknown price under a spend cap, SAFE-16.a", signal);
      if (!waited.approved) return unpriced(waited.card);
      let id: string;
      try {
        id = ledger!.recordUnknown({ provider: call.provider, model: call.model, now: now() });
      } catch (err) {
        return unpriced({
          requestId: waited.requestId,
          outcome: "unavailable",
          error: err instanceof Error ? err.message : String(err),
        });
      }
      note(
        `[operator] AUTONOMY-8: the owner approved request ${waited.requestId}; sending that one call at an ` +
          "unknown price (SAFE-16.a: never counted as $0; the next call at an unknown price asks again).",
      );
      return id;
    });
    cardTurn = turn.catch(() => undefined);
    return turn;
  };

  const settle = (id: string, s: SpendSettlement, provider: string, providerCap: number | undefined) => {
    try {
      ledger?.settle(id, s, now());
    } catch {
      // Ledger write failed after the call: the reservation stays counted.
    }
    if (!opts.onWarning || caps.kind !== "caps") return;
    // SAFE-15: each cap this call counts against warns once per crossing.
    const warnings: SpendWarning[] = [];
    try {
      if (caps.totalMicroUsd !== null) {
        const w = ledger?.noteWarning({ capMicroUsd: caps.totalMicroUsd, now: now() });
        if (w) warnings.push(w);
      }
      if (providerCap !== undefined) {
        const w = ledger?.noteWarning({ capMicroUsd: providerCap, now: now(), provider });
        if (w) warnings.push(w);
      }
    } catch {
      // Warning bookkeeping never breaks a call that already went out.
    }
    for (const w of warnings) opts.onWarning(w);
  };

  const guarded: SpendFetch = async (input, init) => {
    if (caps.kind === "invalid") return stop(spendCapInvalidAsk(caps.keys));
    const body = typeof init?.body === "string" ? init.body : "";
    const model = modelFromRequestBody(body);
    const price = priceForModel(model);
    const provider = providerOf(input);
    const providerCap = caps.providers.get(provider);
    const total = caps.totalMicroUsd ?? undefined;
    if (!price) {
      // No cap covers this call: its unknown cost counts against nothing.
      if (total === undefined && providerCap === undefined) return fetchImpl(input, init);
      // SAFE-16.a: under a cap it stops and asks on a card showing the amount as unknown.
      const unknownId = await passUnknownOnCard(
        {
          provider,
          model,
          ...(total !== undefined ? { capMicroUsd: total } : {}),
          ...(providerCap !== undefined ? { providerCapMicroUsd: providerCap } : {}),
        },
        init?.signal ?? undefined,
      );
      let sent: Response;
      try {
        sent = await fetchImpl(input, init);
      } catch (err) {
        settle(unknownId, { status: "unknown", usage: null }, provider, providerCap);
        throw err;
      }
      if (!sent.ok) {
        settle(unknownId, { status: "failed" }, provider, providerCap);
        return sent;
      }
      let used: AgentTokenUsage | null = null;
      try {
        used = opts.readUsage(await sent.clone().json());
      } catch {
        used = null;
      }
      settle(unknownId, { status: "unknown", usage: used }, provider, providerCap);
      return sent;
    }
    const estimate = estimateCallMicroUsd(price, Buffer.byteLength(body, "utf8"));
    const call: PausedCall = {
      provider,
      model,
      estimateMicroUsd: estimate,
      ...(total !== undefined ? { capMicroUsd: total } : {}),
      ...(providerCap !== undefined ? { providerCapMicroUsd: providerCap } : {}),
    };
    let hold: SpendReservation;
    try {
      db ??= opts.db ?? openCorvidinhoDb({ env });
      ledger ??= new SpendLedger(db);
      hold = ledger.reserve({ ...call, now: now() });
    } catch (err) {
      return stop(spendCapLedgerAsk(err instanceof Error ? err.message : String(err)));
    }
    // SAFE-8: past a cap, ask the owner to let this one call through (a no stops).
    const holdId = hold.ok ? hold.id : await passOnCard(call, hold.trips, init?.signal ?? undefined);

    let resp: Response;
    try {
      resp = await fetchImpl(input, init);
    } catch (err) {
      settle(holdId, { status: "estimated" }, provider, providerCap);
      throw err;
    }
    if (!resp.ok) {
      settle(holdId, { status: "failed" }, provider, providerCap);
      return resp;
    }
    let usage: AgentTokenUsage | null = null;
    try {
      usage = opts.readUsage(await resp.clone().json());
    } catch {
      usage = null;
    }
    settle(
      holdId,
      usage
        ? { status: "actual", usage, costMicroUsd: costMicroUsd(price, usage) }
        : { status: "estimated" },
      provider,
      providerCap,
    );
    return resp;
  };

  return {
    fetch: guarded,
    finish(result) {
      const ask = pending;
      pending = null;
      if (!ask) return result;
      return { summary: SPEND_CAP_SUMMARY, filesChanged: [...result.filesChanged], ask };
    },
  };
}

/** How a flat-priced call ended: billed, certainly not billed, or maybe billed. */
export type FlatSpendOutcome = "billed" | "not-billed" | "unknown";

/** A flat-priced call's SAFE-8 hold (see {@link reserveFlatSpend}). */
export type FlatSpendHold =
  | { kind: "off" }
  | { kind: "held"; settle(outcome: FlatSpendOutcome): void }
  | { kind: "stopped"; ask: HumanAsk };

/**
 * SAFE-8 for a tool call with a flat price per call (REQ-agent-098), such as
 * a Brave `web-search` (about $0.005, #318): the same rolling 24 h ledger and
 * total cap as the model calls. No cap at all (neither the total cap nor
 * SAFE-14's provider caps) ⇒ `off` and the DB is never opened. While any cap
 * is set the price is reserved in the IMMEDIATE ledger transaction before the
 * call, so the call is recorded like a provider call; it counts against the
 * total cap only (a provider cap is keyed on a configured model provider,
 * REQ-agent-114, so none covers it). A call that would pass the total cap, or
 * cannot be counted (a spend-cap setting that is not valid, an unavailable
 * ledger), is `stopped` with the same `spend-cap` ask a model call gets, and
 * must not be sent. `settle` records the outcome once: `billed` keeps the
 * price as the call's actual cost, `not-billed` (refused before connecting,
 * or an HTTP error reply) counts 0, `unknown` (network error, timeout, abort,
 * unreadable reply) keeps it counted at the estimate. The 80% warning is
 * noted by the next model call's settle, which sees this row in the window.
 * A free call (a GIPHY `gif-search`, #318) passes a price of 0: its row is
 * recorded at $0, and it is stopped only when the window is already past the
 * cap (spend + 0 > cap).
 */
export function reserveFlatSpend(opts: {
  env?: NodeJS.ProcessEnv;
  /** Ledger provider label (the API host). */
  provider: string;
  /** Ledger model label (the priced call, e.g. `brave-web-search`). */
  model: string;
  costMicroUsd: number;
  /** Test seam: ledger DB (default: shared DB under CORVIDINHO_DATA_DIR, closed after settle). */
  db?: Database;
  now?: () => number;
}): FlatSpendHold {
  const env = opts.env ?? process.env;
  const caps = parseSpendCaps(env);
  if (caps.kind === "off") return { kind: "off" };
  if (caps.kind === "invalid") return { kind: "stopped", ask: spendCapInvalidAsk(caps.keys) };
  const total = caps.totalMicroUsd ?? undefined;
  const now = opts.now ?? Date.now;
  const cost = Math.max(0, Math.ceil(opts.costMicroUsd));
  let db: Database | undefined;
  const close = () => {
    if (opts.db || !db) return;
    try {
      db.close();
    } catch {
      // already closed
    }
  };
  let ledger: SpendLedger;
  let hold: SpendReservation;
  try {
    db = opts.db ?? openCorvidinhoDb({ env });
    ledger = new SpendLedger(db);
    hold = ledger.reserve({
      provider: opts.provider,
      model: opts.model,
      estimateMicroUsd: cost,
      ...(total !== undefined ? { capMicroUsd: total } : {}),
      now: now(),
    });
  } catch (err) {
    close();
    return { kind: "stopped", ask: spendCapLedgerAsk(err instanceof Error ? err.message : String(err)) };
  }
  if (!hold.ok) {
    close();
    return { kind: "stopped", ask: spendCapReachedAsk({ estimateMicroUsd: cost, trips: hold.trips }) };
  }
  const id = hold.id;
  let settled = false;
  return {
    kind: "held",
    settle(outcome) {
      if (settled) return;
      settled = true;
      try {
        ledger.settle(
          id,
          outcome === "billed"
            ? {
                status: "actual",
                usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
                costMicroUsd: cost,
              }
            : outcome === "not-billed"
              ? { status: "failed" }
              : { status: "estimated" },
          now(),
        );
      } catch {
        // Ledger write failed after the call: the reservation stays counted.
      } finally {
        close();
      }
    },
  };
}

/**
 * The capped fetch alone (see createSpendGuard). Returns `fetchImpl` itself
 * when no cap is set. Stopped calls throw SpendCapRefusal before any request.
 */
export function withSpendCap(fetchImpl: SpendFetch, opts: SpendCapOptions): SpendFetch {
  return createSpendGuard(fetchImpl, opts).fetch;
}

/**
 * AGENT-5: with per-tier model keys set, the first tier (read, tool, code)
 * whose model has no known price and whose calls a cap covers (`covered`,
 * given the tier's provider id). Runs at that tier (e.g. read-tier delegate
 * workers and council voices) stop and ask, so doctor and /status flag it up
 * front. Null when no per-tier key is set or every tier's model is priced or
 * uncovered.
 */
function unpricedTierModel(
  env: NodeJS.ProcessEnv,
  covered: (provider: string | null) => boolean,
): { tier: CapabilityTier; model: string } | null {
  const models = perTierModels(env);
  if (!models) return null;
  for (const tier of ["read", "tool", "code"] as const) {
    // AGENT-10: a tier with no model calls nothing (its runs fail with the
    // no-provider notice), so it never stops at the spend check.
    if (!models[tier] || priceForModel(models[tier]) !== null) continue;
    const p = providerForTier(env, tier);
    if (covered(p ? providerId(p).toLowerCase() : null)) return { tier, model: models[tier] };
  }
  return null;
}

/**
 * AUTONOMOUS-8 / SAFE-14 — rolling 24 h spend against each cap right now
 * (doctor, the owner's Discord /status): the total cap (if set) over every
 * recorded call, and each provider cap over that provider's calls. Opens the
 * shared DB only when a cap is set and closes it again unless `db` was
 * passed in. Never throws. `model` unpriced (and covered by a cap) ⇒ flagged
 * as before; else an unpriced, covered per-tier model is flagged with its
 * tier.
 */
export function readSpendSnapshot(opts: {
  env?: NodeJS.ProcessEnv;
  /** Configured provider model (loadLlmEnv().model). */
  model: string;
  db?: Database;
  now?: number;
}): SpendSnapshot {
  const env = opts.env ?? process.env;
  const caps = parseSpendCaps(env);
  if (caps.kind === "off") return { kind: "off" };
  if (caps.kind === "invalid") return { kind: "invalid", keys: caps.keys };
  // A call is covered when the total cap is set or its provider has a cap;
  // an unknown provider counts as covered (flag rather than hide).
  const covered = (provider: string | null) =>
    caps.totalMicroUsd !== null || provider === null || caps.providers.has(provider);
  let db: Database | undefined;
  try {
    db = opts.db ?? openCorvidinhoDb({ env });
    const ledger = new SpendLedger(db);
    const t = opts.now ?? Date.now();
    const window = ledger.window(t);
    const providers: ProviderSpend[] = [...caps.providers]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([provider, capMicroUsd]) => ({ provider, capMicroUsd, window: ledger.window(t, provider) }));
    // No model configured (AGENT-10): nothing is called, nothing to price.
    const head = providerForTier(env, loadTierFromEnv(env, "tool"));
    const headProvider =
      head && head.entry.model === opts.model ? providerId(head).toLowerCase() : null;
    const priced =
      !opts.model.trim() || priceForModel(opts.model) !== null || !covered(headProvider);
    const tierGap = priced ? unpricedTierModel(env, covered) : null;
    return {
      kind: "cap",
      ...(caps.totalMicroUsd !== null ? { capMicroUsd: caps.totalMicroUsd } : {}),
      window,
      ...(providers.length > 0 ? { providers } : {}),
      model: tierGap?.model ?? opts.model,
      priced: priced && !tierGap,
      ...(tierGap ? { tier: tierGap.tier } : {}),
    };
  } catch (err) {
    return { kind: "unreadable", error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (!opts.db) {
      try {
        db?.close();
      } catch {
        // already closed
      }
    }
  }
}

/**
 * AUTONOMOUS-8 — spend in the last 24 h against the total cap, for `doctor`'s
 * `spend` line. `info` when no cap is set; `warn` at the 80% warning, at the
 * cap, for an unpriced model, an invalid setting or an unreadable ledger.
 * Informational: never fails doctor.
 */
export function spendDoctorCheck(opts: {
  env?: NodeJS.ProcessEnv;
  /** Configured provider model (loadLlmEnv().model). */
  model: string;
  db?: Database;
  now?: number;
}): SpendDoctorLine {
  return formatSpendDoctorLine(readSpendSnapshot(opts));
}

/**
 * AUTONOMOUS-8 / SAFE-14 — every doctor spend line: `spend` (the total cap,
 * as spendDoctorCheck) and one `spend provider:<id>` line per provider cap.
 * Informational: never fails doctor.
 */
export function spendDoctorChecks(opts: {
  env?: NodeJS.ProcessEnv;
  /** Configured provider model (loadLlmEnv().model). */
  model: string;
  db?: Database;
  now?: number;
}): NamedSpendDoctorLine[] {
  return formatSpendDoctorLines(readSpendSnapshot(opts));
}

/**
 * SAFE-8 — optional operator-set daily spend cap on provider (LLM) calls.
 *
 * Off unless CORVIDINHO_DAILY_SPEND_CAP_USD is set. With a cap, every
 * OpenAI-compatible chat call is priced from a per-model table, its estimate is
 * reserved against a rolling 24 h ledger in the shared SQLite DB before the
 * request is sent, and the reservation is replaced by the provider-reported
 * cost once the reply arrives. No cap ⇒ the fetch comes back untouched and the
 * DB is never opened (no behavior change).
 *
 * SAFE-8 as amended (#98): at 80% of the cap the run gets one warning per
 * crossing, recorded in `spend_alerts` across processes and re-armed once
 * spend is seen back under 70% (spend-alerts.ts); the Discord bridge delivers
 * recorded warnings to the owner (spend-outbox.ts). At 100% the call is not
 * sent — the guard records a `spend-cap` ask and the execute hook ends the
 * attempt with it, so the run stops `blocked` and the owner is asked through
 * the AUTONOMY-1/2 path instead of the call being refused or overspent.
 *
 * Assumptions (see specs/agent REQ-agent-098):
 *  - "Daily" is the last 24 hours (rolling), not a calendar day.
 *  - Prices are standard USD per 1M tokens; cached-input discounts are ignored,
 *    so the count errs high.
 *  - A model missing from the table has no known price: while a cap is set its
 *    calls stop and ask — never counted as free, never guessed.
 *  - Pre-call estimate: request bytes / 3 prompt tokens + a 4096-token reply
 *    reserve. A reply longer than the reserve can overshoot the cap by that one
 *    call; the next call then stops and asks.
 *  - Provider omitted `usage` (or the reply was unreadable) ⇒ the estimate stays
 *    counted. HTTP error reply ⇒ counted as 0 (not billed). Network error or
 *    abort ⇒ the estimate stays counted (it may have been billed).
 *  - Several processes (bridge-spawned agents) share one ledger: the check and
 *    the reservation run in one IMMEDIATE transaction, so concurrent calls
 *    cannot both squeeze under the cap.
 */

import type { Database } from "bun:sqlite";
import { openCorvidinhoDb } from "../store/db.ts";
import { scrubSecrets } from "../store/scrub.ts";
import { ensureSpendAlerts, rearmSpendAlerts, recordSpendWarning } from "./spend-alerts.ts";
import {
  formatSpendDoctorLine,
  SPEND_CAP_ENV,
  SPEND_CAP_SUMMARY,
  spendCapInvalidAsk,
  spendCapLedgerAsk,
  spendCapReachedAsk,
  spendCapUnpricedAsk,
  type SpendDoctorLine,
  type SpendSnapshot,
} from "./spend-notice.ts";
import { perTierModels, type CapabilityTier } from "./tier.ts";
import type {
  AgentTokenUsage,
  ExecuteResult,
  HumanAsk,
  SpendWarning,
} from "./types.ts";

export { formatUsd, SPEND_CAP_ENV, SPEND_WARN_PERCENT } from "./spend-notice.ts";
export type { SpendDoctorLine, SpendSnapshot } from "./spend-notice.ts";

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

/** Read the cap from env. Empty/unset = off; anything but a plain USD amount = invalid. */
export function parseSpendCap(env: NodeJS.ProcessEnv = process.env): SpendCap {
  const raw = env[SPEND_CAP_ENV]?.trim();
  if (!raw) return { kind: "off" };
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(raw)) return { kind: "invalid" };
  const capUsd = Number(raw);
  if (!Number.isFinite(capUsd) || capUsd > 1e9) return { kind: "invalid" };
  return { kind: "cap", capUsd, capMicroUsd: Math.round(capUsd * 1e6) };
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
`;

/**
 * Create the ledger and alert tables in the shared DB (idempotent; no schema
 * version bump). `spend_alerts` holds only constant kinds and integers.
 */
export function ensureSpendLedger(db: Database): void {
  db.exec(SPEND_LEDGER_SQL);
  ensureSpendAlerts(db);
}

/** reserved → in flight; actual → provider usage; estimated → no usage, estimate kept; failed → HTTP error, 0. */
export type SpendStatus = "reserved" | "actual" | "estimated" | "failed";

export type SpendSettlement =
  | { status: "actual"; usage: AgentTokenUsage; costMicroUsd: number }
  | { status: "estimated" }
  | { status: "failed" };

export type SpendWindow = {
  spentMicroUsd: number;
  /** Provider calls counted in the window (HTTP-failed calls excluded). */
  calls: number;
  /** Calls still counted at their estimate (in flight or no usage reported). */
  estimatedCalls: number;
};

export type SpendReservation =
  | { ok: true; id: string; spentMicroUsd: number }
  | { ok: false; spentMicroUsd: number };

/** Rolling 24 h spend ledger over the shared DB. */
export class SpendLedger {
  constructor(private readonly db: Database) {
    ensureSpendLedger(db);
  }

  /** Spend counted in the 24 h window ending at `now`. */
  window(now: number): SpendWindow {
    const row = this.db
      .query(
        `SELECT COALESCE(SUM(cost_micro_usd), 0) AS spent,
                COALESCE(SUM(CASE WHEN status != 'failed' THEN 1 ELSE 0 END), 0) AS calls,
                COALESCE(SUM(CASE WHEN status IN ('reserved', 'estimated') THEN 1 ELSE 0 END), 0) AS estimated
           FROM spend_ledger WHERE ts > ?`,
      )
      .get(now - SPEND_WINDOW_MS) as { spent: number; calls: number; estimated: number };
    return {
      spentMicroUsd: row.spent,
      calls: row.calls,
      estimatedCalls: row.estimated,
    };
  }

  /**
   * Atomically check the cap and reserve the estimate. Refuses (no row) when
   * window spend + estimate would exceed the cap. Spend seen back under the
   * re-arm level re-arms the 80% warning and the cap ping (spend-alerts.ts).
   */
  reserve(opts: {
    provider: string;
    model: string;
    estimateMicroUsd: number;
    capMicroUsd: number;
    now: number;
  }): SpendReservation {
    const run = this.db.transaction((): SpendReservation => {
      const { spentMicroUsd } = this.window(opts.now);
      rearmSpendAlerts(this.db, { spentMicroUsd, capMicroUsd: opts.capMicroUsd, now: opts.now });
      if (spentMicroUsd + opts.estimateMicroUsd > opts.capMicroUsd) {
        return { ok: false, spentMicroUsd };
      }
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
      return { ok: true, id, spentMicroUsd };
    });
    return run.immediate();
  }

  /**
   * SAFE-8 80% warning, once per crossing: when 24 h spend is at or past the
   * threshold and the warning for this cap value is armed, record one
   * undelivered `warn` row and return it; under the re-arm level, re-arm.
   * Armed = no warning for this cap value since the last re-arm and within
   * 24 h, so a new crossing or a new cap value warns again. Check and insert
   * share one IMMEDIATE transaction, so concurrent processes warn once
   * between them. A zero cap never warns (nothing is spent).
   */
  noteWarning(opts: { capMicroUsd: number; now: number }): SpendWarning | null {
    const run = this.db.transaction((): SpendWarning | null => {
      const { spentMicroUsd } = this.window(opts.now);
      return recordSpendWarning(this.db, {
        spentMicroUsd,
        capMicroUsd: opts.capMicroUsd,
        now: opts.now,
      });
    });
    return run.immediate();
  }

  /** Replace a reservation with what the call actually cost. */
  settle(id: string, s: SpendSettlement, now: number): void {
    if (s.status === "actual") {
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
};

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
 * Wrap the provider fetch with the SAFE-8 cap. No cap ⇒ `fetch` is
 * `fetchImpl` itself and nothing else happens. With a cap, a call that would
 * pass it (or cannot be counted: invalid cap value, unpriced model, ledger
 * unavailable) throws SpendCapRefusal before any request is sent and leaves
 * its ask for `finish`.
 */
export function createSpendGuard(fetchImpl: SpendFetch, opts: SpendCapOptions): SpendGuard {
  const env = opts.env ?? process.env;
  const cap = parseSpendCap(env);
  if (cap.kind === "off") return { fetch: fetchImpl, finish: (r) => r };
  const now = opts.now ?? Date.now;
  let ledger: SpendLedger | undefined;
  let pending: HumanAsk | null = null;

  const stop = (ask: HumanAsk): never => {
    pending = ask;
    throw new SpendCapRefusal(ask);
  };

  const settle = (id: string, s: SpendSettlement) => {
    try {
      ledger?.settle(id, s, now());
    } catch {
      // Ledger write failed after the call: the reservation stays counted.
    }
    if (!opts.onWarning || cap.kind !== "cap") return;
    let warning: SpendWarning | null = null;
    try {
      warning = ledger?.noteWarning({ capMicroUsd: cap.capMicroUsd, now: now() }) ?? null;
    } catch {
      // Warning bookkeeping never breaks a call that already went out.
    }
    if (warning) opts.onWarning(warning);
  };

  const guarded: SpendFetch = async (input, init) => {
    if (cap.kind === "invalid") return stop(spendCapInvalidAsk());
    const body = typeof init?.body === "string" ? init.body : "";
    const model = modelFromRequestBody(body);
    const price = priceForModel(model);
    if (!price) return stop(spendCapUnpricedAsk(model, cap.capMicroUsd, opts.modelKey));
    let hold: SpendReservation;
    const estimate = estimateCallMicroUsd(price, Buffer.byteLength(body, "utf8"));
    try {
      ledger ??= new SpendLedger(opts.db ?? openCorvidinhoDb({ env }));
      hold = ledger.reserve({
        provider: providerOf(input),
        model,
        estimateMicroUsd: estimate,
        capMicroUsd: cap.capMicroUsd,
        now: now(),
      });
    } catch (err) {
      return stop(spendCapLedgerAsk(err instanceof Error ? err.message : String(err)));
    }
    if (!hold.ok) {
      return stop(
        spendCapReachedAsk({
          spentMicroUsd: hold.spentMicroUsd,
          estimateMicroUsd: estimate,
          capMicroUsd: cap.capMicroUsd,
        }),
      );
    }

    let resp: Response;
    try {
      resp = await fetchImpl(input, init);
    } catch (err) {
      settle(hold.id, { status: "estimated" });
      throw err;
    }
    if (!resp.ok) {
      settle(hold.id, { status: "failed" });
      return resp;
    }
    let usage: AgentTokenUsage | null = null;
    try {
      usage = opts.readUsage(await resp.clone().json());
    } catch {
      usage = null;
    }
    settle(
      hold.id,
      usage
        ? { status: "actual", usage, costMicroUsd: costMicroUsd(price, usage) }
        : { status: "estimated" },
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

/**
 * The capped fetch alone (see createSpendGuard). Returns `fetchImpl` itself
 * when no cap is set. Stopped calls throw SpendCapRefusal before any request.
 */
export function withSpendCap(fetchImpl: SpendFetch, opts: SpendCapOptions): SpendFetch {
  return createSpendGuard(fetchImpl, opts).fetch;
}

/**
 * AGENT-5: with per-tier model keys set, the first tier (read, tool, code)
 * whose model has no known price. Runs at that tier (e.g. read-tier delegate
 * workers and council voices) stop and ask, so doctor and /status flag it up
 * front. Null when no per-tier key is set or every tier's model is priced.
 */
function unpricedTierModel(
  env: NodeJS.ProcessEnv,
): { tier: CapabilityTier; model: string } | null {
  const models = perTierModels(env);
  if (!models) return null;
  for (const tier of ["read", "tool", "code"] as const) {
    // AGENT-10: a tier with no model calls nothing (its runs fail with the
    // no-provider notice), so it never stops at the spend check.
    if (models[tier] && priceForModel(models[tier]) === null) return { tier, model: models[tier] };
  }
  return null;
}

/**
 * AUTONOMOUS-8 — rolling 24 h spend against the cap right now (doctor,
 * Discord /status). Opens the shared DB only when a cap is set and closes it
 * again unless `db` was passed in. Never throws. `model` unpriced ⇒ flagged
 * as before; else an unpriced per-tier model is flagged with its tier.
 */
export function readSpendSnapshot(opts: {
  env?: NodeJS.ProcessEnv;
  /** Configured provider model (loadLlmEnv().model). */
  model: string;
  db?: Database;
  now?: number;
}): SpendSnapshot {
  const env = opts.env ?? process.env;
  const cap = parseSpendCap(env);
  if (cap.kind === "off") return { kind: "off" };
  if (cap.kind === "invalid") return { kind: "invalid" };
  let db: Database | undefined;
  try {
    db = opts.db ?? openCorvidinhoDb({ env });
    const window = new SpendLedger(db).window(opts.now ?? Date.now());
    // No model configured (AGENT-10): nothing is called, nothing to price.
    const priced = !opts.model.trim() || priceForModel(opts.model) !== null;
    const tierGap = priced ? unpricedTierModel(env) : null;
    return {
      kind: "cap",
      capMicroUsd: cap.capMicroUsd,
      window,
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
 * AUTONOMOUS-8 — spend in the last 24 h against the cap, for `doctor`.
 * `info` when no cap is set; `warn` at the 80% warning, at the cap, for an
 * unpriced model, an invalid cap or an unreadable ledger. Informational: never
 * fails doctor.
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

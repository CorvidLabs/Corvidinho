/**
 * SAFE-8 — optional operator-set daily spend cap on provider (LLM) calls.
 *
 * Off unless CORVIDINHO_DAILY_SPEND_CAP_USD is set. With a cap, every
 * OpenAI-compatible chat call is priced from a per-model table, its estimate is
 * reserved against a rolling 24 h ledger in the shared SQLite DB before the
 * request is sent, and the call is refused when it would push spend past the
 * cap. The reservation is replaced by the provider-reported cost once the reply
 * arrives. No cap ⇒ `withSpendCap` returns the fetch untouched and the DB is
 * never opened (no behavior change).
 *
 * Assumptions (see specs/agent REQ-agent-098):
 *  - "Daily" is the last 24 hours (rolling), not a calendar day.
 *  - Prices are standard USD per 1M tokens; cached-input discounts are ignored,
 *    so the count errs high.
 *  - A model missing from the table has no known price: while a cap is set its
 *    calls are refused — never counted as free, never guessed.
 *  - Pre-call estimate: request bytes / 3 prompt tokens + a 4096-token reply
 *    reserve. A reply longer than the reserve can overshoot the cap by that one
 *    call; the next call is then refused.
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
import type { AgentTokenUsage } from "./types.ts";

/** Operator knob: daily (rolling 24 h) USD cap on provider calls. Unset = off. */
export const SPEND_CAP_ENV = "CORVIDINHO_DAILY_SPEND_CAP_USD";
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

/** Whole cents print 2 decimals; anything else 4, rounded up (never under-reports spend). */
export function formatUsd(microUsd: number): string {
  const [unit, digits] = microUsd % 10_000 === 0 ? [10_000, 2] : [100, 4];
  const n = Math.ceil(Math.max(0, microUsd) / unit);
  const scale = 10 ** digits;
  return `$${Math.floor(n / scale)}.${String(n % scale).padStart(digits, "0")}`;
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

/** Create the ledger table in the shared DB (idempotent; no schema version bump). */
export function ensureSpendLedger(db: Database): void {
  db.exec(SPEND_LEDGER_SQL);
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
   * window spend + estimate would exceed the cap.
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

/** Thrown by the capped fetch; the tool loop reports it as the task summary. */
export class SpendCapRefusal extends Error {
  override name = "SpendCapRefusal";
}

export type SpendFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type SpendCapOptions = {
  env?: NodeJS.ProcessEnv;
  /** Reads provider-reported usage from the parsed JSON reply (execute's extractUsage). */
  readUsage: (data: unknown) => AgentTokenUsage | null;
  /** Test seam: ledger DB. Default: shared DB under CORVIDINHO_DATA_DIR, opened on first call. */
  db?: Database;
  now?: () => number;
};

const INVALID_CAP_MESSAGE =
  `spend cap: refused provider call — ${SPEND_CAP_ENV} is set but is not a plain USD amount ` +
  "(e.g. 5 or 2.50); fix or unset it (SAFE-8)";

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

/**
 * Wrap the provider fetch with the SAFE-8 cap. Returns `fetchImpl` itself when
 * no cap is set. Refusals throw SpendCapRefusal before any request is sent.
 */
export function withSpendCap(fetchImpl: SpendFetch, opts: SpendCapOptions): SpendFetch {
  const env = opts.env ?? process.env;
  const cap = parseSpendCap(env);
  if (cap.kind === "off") return fetchImpl;
  const now = opts.now ?? Date.now;
  let ledger: SpendLedger | undefined;

  const settle = (id: string, s: SpendSettlement) => {
    try {
      ledger?.settle(id, s, now());
    } catch {
      // Ledger write failed after the call: the reservation stays counted.
    }
  };

  return async (input, init) => {
    if (cap.kind === "invalid") throw new SpendCapRefusal(INVALID_CAP_MESSAGE);
    const body = typeof init?.body === "string" ? init.body : "";
    const model = modelFromRequestBody(body);
    const price = priceForModel(model);
    if (!price) {
      throw new SpendCapRefusal(
        `spend cap: refused provider call — model "${scrubSecrets(model) || "(none)"}" has no known price, ` +
          `so the ${formatUsd(cap.capMicroUsd)} daily cap (${SPEND_CAP_ENV}) cannot be enforced (SAFE-8); ` +
          "use a priced model or unset the cap",
      );
    }
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
      const msg = err instanceof Error ? err.message : String(err);
      throw new SpendCapRefusal(
        `spend cap: refused provider call — spend ledger unavailable (${scrubSecrets(msg).slice(0, 200)}) (SAFE-8)`,
      );
    }
    if (!hold.ok) {
      throw new SpendCapRefusal(
        `spend cap: refused provider call — ${formatUsd(hold.spentMicroUsd)} spent in the last 24h ` +
          `+ ~${formatUsd(estimate)} for this call would exceed the ${formatUsd(cap.capMicroUsd)} ` +
          `daily cap (${SPEND_CAP_ENV}, SAFE-8)`,
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
}

export type SpendDoctorLine = { ok: true; mark: "ok" | "warn"; detail: string };

/**
 * AUTONOMOUS-8 — spend in the last 24 h against the cap, for `doctor`.
 * Null when no cap is set. Informational: never fails doctor.
 */
export function spendDoctorCheck(opts: {
  env?: NodeJS.ProcessEnv;
  /** Configured provider model (loadLlmEnv().model). */
  model: string;
  db?: Database;
  now?: number;
}): SpendDoctorLine | null {
  const env = opts.env ?? process.env;
  const cap = parseSpendCap(env);
  if (cap.kind === "off") return null;
  if (cap.kind === "invalid") {
    return {
      ok: true,
      mark: "warn",
      detail: `${SPEND_CAP_ENV} is not a plain USD amount — every provider call is refused until it is fixed or unset (SAFE-8)`,
    };
  }
  let window: SpendWindow;
  let db: Database | undefined;
  try {
    db = opts.db ?? openCorvidinhoDb({ env });
    window = new SpendLedger(db).window(opts.now ?? Date.now());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: true, mark: "warn", detail: `spend ledger unreadable: ${scrubSecrets(msg).slice(0, 200)}` };
  } finally {
    if (!opts.db) db?.close();
  }
  const estimated = window.estimatedCalls
    ? `, ${window.estimatedCalls} counted at its estimate`
    : "";
  const base =
    `${formatUsd(window.spentMicroUsd)} of ${formatUsd(cap.capMicroUsd)} daily cap used in the last 24h ` +
    `(${window.calls} provider call(s)${estimated}; ${SPEND_CAP_ENV}, SAFE-8)`;
  if (!priceForModel(opts.model)) {
    return {
      ok: true,
      mark: "warn",
      detail: `${base}; model "${scrubSecrets(opts.model)}" has no known price, so provider calls are refused while the cap is set`,
    };
  }
  return { ok: true, mark: "ok", detail: base };
}

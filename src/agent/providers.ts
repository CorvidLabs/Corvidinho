/**
 * Model providers (AGENT-13, AGENT-10): the operator configures every model
 * the agent calls, and nothing is built in as a default.
 *
 * `CORVIDINHO_LLM_MODEL` and the per-tier keys (`CORVIDINHO_LLM_MODEL_READ`,
 * `_TOOL`, `_CODE`, AGENT-5) each hold a comma-separated list of entries. An
 * entry is `kind:model` with kind `openai`, `ollama`, `anthropic` or `cli`; a
 * bare entry, or one whose prefix is not a kind (`qwen3:30b`), is
 * OpenAI-compatible.
 *
 * The list is a fallback chain (AGENT-11, {@link callChain}): a run calls the
 * tier's first entry, and when that model fails (an HTTP error, 404 / 410 for
 * a retired model included, a network error, a timeout or a malformed reply)
 * it goes on at once with the next entry and says so — no retry, no backoff.
 * A spend-cap stop, a Deny or a lapsed card is not a model failure and never
 * fails over. Nothing is remembered across processes: each `task run` process
 * tries the head once, then keeps the model it fell back to.
 *
 * The optional `CORVIDINHO_LLM_MODEL_ORDER` (same entries, weakest first) is
 * the order I set for AGENT-17.a ({@link strongerModel}): a run that still
 * only plans, or says "Done." with nothing changed, after its one nudge moves
 * to the next model in that order that its tier's list has. Unset = no order,
 * so it never moves; nothing is ranked by price or benchmark.
 *
 * Each kind has its vendor endpoint (the endpoint of a provider the operator
 * chose, not a default model):
 * - `openai`: `CORVIDINHO_LLM_BASE_URL` (else `https://api.openai.com/v1`),
 *   key `CORVIDINHO_LLM_API_KEY` or `OPENAI_API_KEY`.
 * - `ollama`: `OLLAMA_HOST` (else `127.0.0.1:11434`), its OpenAI-compatible
 *   `/v1` API, no key.
 * - `anthropic`: `https://api.anthropic.com/v1` (its OpenAI-compatible API),
 *   key `ANTHROPIC_API_KEY`.
 * Those three go through the one chat-completions transport and the SAFE-8
 * spend guard. With no usable entry a run fails with the no-provider notice.
 * Keys are read from env only and never printed (SAFE-6).
 *
 * - `cli` (AGENT-13 / AGENT-13.a): a headless agent CLI the owner names,
 *   `cli:<program> [args…]` (split on whitespace, no shell). It is not a chat
 *   endpoint: it runs a whole attempt itself (src/agent/headless-cli.ts), only
 *   in the owner's own runs inside that talk's worktree. Anywhere else the
 *   chain skips it ({@link callChain}, a `skipped` hop with the AGENT-11
 *   note) and the next entry runs; where it may run, the chat path stops at
 *   it and hands the attempt over (`handover`). Its provider id is
 *   `cli:<program name>`, it goes through the same SAFE-8 spend guard, and it
 *   never has a known price (SAFE-16).
 */

import { STATUS_CODES } from "node:http";
import { basename } from "node:path";
import { scrubSecrets } from "../store/scrub.ts";
import { loadTierFromEnv, TIER_MODEL_ENV, type CapabilityTier } from "./tier.ts";
import type { AgentTokenUsage, ModelFallback, ModelUsage } from "./types.ts";

export const PROVIDER_KINDS = ["openai", "ollama", "anthropic", "cli"] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

/** One configured model: the provider kind and the model id sent as `body.model`. */
export type ModelEntry = { kind: ProviderKind; model: string };

/** The `openai` kind's endpoint when `CORVIDINHO_LLM_BASE_URL` is unset. */
export const OPENAI_BASE_URL = "https://api.openai.com/v1";
/** The `ollama` kind's server when `OLLAMA_HOST` is unset (Ollama's own default). */
export const OLLAMA_DEFAULT_HOST = "http://127.0.0.1:11434";
/** The `anthropic` kind's OpenAI-compatible endpoint. */
export const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";

/** Env keys that hold each kind's API key (first set one wins); none for ollama. */
export const PROVIDER_KEY_ENV: Readonly<Record<ProviderKind, readonly string[]>> = {
  openai: ["CORVIDINHO_LLM_API_KEY", "OPENAI_API_KEY"],
  ollama: [],
  anthropic: ["ANTHROPIC_API_KEY"],
  // AGENT-13.a: the CLI reads its own login or the keys the owner passes it
  // (`CORVIDINHO_LLM_CLI_ENV`, src/agent/headless-cli.ts); none is required.
  cli: [],
};

const ALL_TIERS: readonly CapabilityTier[] = ["read", "tool", "code"];

/**
 * Start of every no-provider notice (AGENT-10): at startup (bridge, WATCH,
 * daemon, `task run`), in `/status`, in doctor / init and as a failed run's
 * summary.
 */
export const NO_PROVIDER_NOTICE = "No model provider is configured";

/** How to set one; ends every notice that has an unset model. */
const HOW_TO_SET =
  "Set CORVIDINHO_LLM_MODEL (or CORVIDINHO_LLM_MODEL_READ / _TOOL / _CODE per tier) to openai:<model>, ollama:<model> or anthropic:<model>; there is no built-in default.";

function isKind(s: string): s is ProviderKind {
  return (PROVIDER_KINDS as readonly string[]).includes(s);
}

/**
 * One entry: split on the first `:` only when the prefix is a kind
 * (case-insensitive); else the whole entry is an OpenAI-compatible model id.
 * Null for a blank entry or a kind with no model (`ollama:`).
 */
export function parseModelEntry(raw: string): ModelEntry | null {
  const s = raw.trim();
  if (!s) return null;
  const i = s.indexOf(":");
  if (i > 0) {
    const prefix = s.slice(0, i).trim().toLowerCase();
    if (isKind(prefix)) {
      let model = s.slice(i + 1).trim();
      // AGENT-13: a CLI command is argv split on whitespace; one space each.
      if (prefix === "cli") model = model.replace(/\s+/g, " ");
      return model ? { kind: prefix, model } : null;
    }
  }
  return { kind: "openai", model: s };
}

/** An ordered, comma-separated list of entries; blanks are skipped. */
export function parseModelChain(raw: string | undefined): ModelEntry[] {
  if (!raw) return [];
  const out: ModelEntry[] = [];
  for (const part of raw.split(",")) {
    const e = parseModelEntry(part);
    if (e) out.push(e);
  }
  return out;
}

/**
 * A tier's configured entries (AGENT-5 / AGENT-13): its own key when that
 * lists any entry, else `CORVIDINHO_LLM_MODEL`, else none (no default).
 */
export function modelChainForTier(
  env: NodeJS.ProcessEnv,
  tier: CapabilityTier,
): ModelEntry[] {
  const own = parseModelChain(env[TIER_MODEL_ENV[tier]]);
  return own.length > 0 ? own : parseModelChain(env.CORVIDINHO_LLM_MODEL);
}

/** How an entry is shown: the bare model for `openai`, else `kind:model`. */
export function entryLabel(entry: ModelEntry): string {
  return entry.kind === "openai" ? entry.model : `${entry.kind}:${entry.model}`;
}

/**
 * AGENT-13: the argv of a `cli` entry — its command split on whitespace (no
 * shell, no quoting); the program is a name looked up on PATH or a path.
 */
export function cliArgv(entry: ModelEntry): string[] {
  return entry.model.split(/\s+/).filter(Boolean);
}

/**
 * AGENT-13 / SAFE-14: a `cli` entry's provider id, `cli:<program name>`
 * (lower-cased): what the SAFE-8 ledger records for its turns and what a
 * provider cap names (`CORVIDINHO_PROVIDER_SPEND_CAPS_USD=cli:<name>=<USD>`).
 */
export function cliProviderId(entry: ModelEntry): string {
  return `cli:${basename(cliArgv(entry)[0] ?? "").toLowerCase()}`;
}

/**
 * The Ollama server from `OLLAMA_HOST` the way Ollama reads it: `host`,
 * `host:port` or a URL; no scheme means http and port 11434; a bind-all
 * address (`0.0.0.0`, `::`) is reached on loopback. No trailing slash.
 */
export function ollamaHostUrl(env: NodeJS.ProcessEnv): string {
  const raw = env.OLLAMA_HOST?.trim();
  if (!raw) return OLLAMA_DEFAULT_HOST;
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  let url: URL;
  try {
    url = new URL(hasScheme ? raw : `http://${raw}`);
  } catch {
    return OLLAMA_DEFAULT_HOST;
  }
  if (!hasScheme && !url.port) url.port = "11434";
  if (url.hostname === "0.0.0.0") url.hostname = "127.0.0.1";
  else if (url.hostname === "[::]") url.hostname = "[::1]";
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
}

/** One entry with its endpoint and key, ready for the chat transport. */
export type ResolvedProvider = {
  entry: ModelEntry;
  /** OpenAI-compatible API root; requests go to `${baseUrl}/chat/completions`. */
  baseUrl: string;
  apiKey: string | undefined;
  /** The env key(s) that hold this kind's key, for notices (never the value). */
  keyEnv: string | null;
  /** False when the kind needs a key and none is set. */
  usable: boolean;
};

/** Resolve an entry's endpoint and key from env (AGENT-13). */
export function resolveEntry(
  entry: ModelEntry,
  env: NodeJS.ProcessEnv,
): ResolvedProvider {
  const keyNames = PROVIDER_KEY_ENV[entry.kind];
  let apiKey: string | undefined;
  for (const name of keyNames) {
    const v = env[name]?.trim();
    if (v) {
      apiKey = v;
      break;
    }
  }
  const keyEnv = keyNames.length > 0 ? keyNames.join(" or ") : null;
  const usable = keyNames.length === 0 || apiKey !== undefined;
  let baseUrl: string;
  // AGENT-13: a CLI has no endpoint; its "base" is its provider id, so
  // `providerId` (and the SAFE-8 ledger) name it `cli:<program name>`.
  if (entry.kind === "cli") baseUrl = cliProviderId(entry);
  else if (entry.kind === "ollama") baseUrl = `${ollamaHostUrl(env)}/v1`;
  else if (entry.kind === "anthropic") baseUrl = ANTHROPIC_BASE_URL;
  else baseUrl = env.CORVIDINHO_LLM_BASE_URL?.trim() || OPENAI_BASE_URL;
  return { entry, baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, keyEnv, usable };
}

/**
 * The provider id: the endpoint's host, which is what the SAFE-8 spend ledger
 * records as `provider` for each call.
 */
export function providerId(p: Pick<ResolvedProvider, "baseUrl">): string {
  try {
    return new URL(p.baseUrl).host || p.baseUrl;
  } catch {
    return p.baseUrl;
  }
}

/** A tier's first entry, resolved; null when the tier has no entry. */
export function providerForTier(
  env: NodeJS.ProcessEnv,
  tier: CapabilityTier,
): ResolvedProvider | null {
  const head = modelChainForTier(env, tier)[0];
  return head ? resolveEntry(head, env) : null;
}

/** The problem of a tier with no entry at all. */
const MODEL_UNSET = "CORVIDINHO_LLM_MODEL is not set";

/** Why a tier has no usable provider, or null when it has one. */
function tierProblem(env: NodeJS.ProcessEnv, tier: CapabilityTier): string | null {
  const p = providerForTier(env, tier);
  if (!p) return MODEL_UNSET;
  if (!p.usable) return `${entryLabel(p.entry)} needs ${p.keyEnv}, which is not set`;
  return null;
}

/**
 * The no-provider notice (AGENT-10) for `tiers` (default: all three), or null
 * when each of them has a usable provider. Tiers with the same problem share
 * one clause; the tier names are left out when every tier asked about has it.
 * Names env keys and models only, never a key value.
 */
export function providerNotice(
  env: NodeJS.ProcessEnv,
  tiers: readonly CapabilityTier[] = ALL_TIERS,
): string | null {
  const groups = new Map<string, CapabilityTier[]>();
  for (const tier of tiers) {
    const problem = tierProblem(env, tier);
    if (!problem) continue;
    const g = groups.get(problem);
    if (g) g.push(tier);
    else groups.set(problem, [tier]);
  }
  if (groups.size === 0) return null;
  let text: string;
  const [only] = [...groups.entries()];
  if (groups.size === 1 && only[1].length === tiers.length) {
    text = `${NO_PROVIDER_NOTICE}: ${only[0]}.`;
  } else {
    const clauses = [...groups.entries()].map(
      ([problem, ts]) => `${ts.join(", ")} tier${ts.length > 1 ? "s" : ""}: ${problem}`,
    );
    text = `${NO_PROVIDER_NOTICE} for some runs — ${clauses.join("; ")}.`;
  }
  return groups.has(MODEL_UNSET) ? `${text} ${HOW_TO_SET}` : text;
}

/**
 * The provider a run at the default tier (`CORVIDINHO_LLM_TIER`, default
 * tool) calls, as "<label> @ <host>"; null when that tier has no usable one.
 * Never a key.
 */
export function defaultProviderLabel(env: NodeJS.ProcessEnv): string | null {
  const p = providerForTier(env, loadTierFromEnv(env, "tool"));
  return p?.usable ? `${entryLabel(p.entry)} @ ${providerId(p)}` : null;
}

/** Per-tier provider state for doctor and `/status`. */
export type ProviderStatus = {
  tiers: Readonly<Record<CapabilityTier, ResolvedProvider | null>>;
  /** Null when every tier has a usable provider. */
  notice: string | null;
};

export function providerStatus(env: NodeJS.ProcessEnv): ProviderStatus {
  return {
    tiers: {
      read: providerForTier(env, "read"),
      tool: providerForTier(env, "tool"),
      code: providerForTier(env, "code"),
    },
    notice: providerNotice(env),
  };
}

// ─── Fallback chain (AGENT-11) ────────────────────────────────────────────

/**
 * Why a configured model's call failed (AGENT-11). Only these fail over; a
 * spend-cap stop (SpendCapRefusal), an abort, a Deny or a lapsed card is not
 * a model failure.
 */
export type ModelFailure =
  | { kind: "http"; status: number }
  | { kind: "timeout" }
  | { kind: "network" }
  | { kind: "malformed" }
  /** A fallback entry whose kind needs a key that is not set: skipped, never called. */
  | { kind: "no-key"; keyEnv: string }
  /**
   * AGENT-13.a: a `cli` entry this attempt may not run (not the owner's own
   * run in their talk worktree, or the shell is not theirs here): skipped,
   * never started. `why` is one fixed short line.
   */
  | { kind: "skipped"; why: string }
  /** AGENT-13: a `cli` entry's program exited non-zero (127: it could not start). */
  | { kind: "exit"; code: number };

/** A failure's short, fixed reason — never provider output (SAFE-6). */
export function modelFailureReason(f: ModelFailure): string {
  switch (f.kind) {
    case "http":
      return `HTTP ${f.status}`;
    case "timeout":
      return "timed out";
    case "network":
      return "network error";
    case "malformed":
      return "malformed reply";
    case "no-key":
      return `${f.keyEnv} is not set`;
    case "skipped":
      return f.why;
    case "exit":
      return f.code === 127 ? "could not start" : `exited ${f.code}`;
  }
}

/**
 * DISCORD-3.b / AGENT-9: a failed model call as one plain line for a failed
 * run's `error` (what the owner's failed-run reply says), e.g. `The model
 * call failed (401 Unauthorized from api.openai.com)`. Built from the failure
 * kind, the status code's standard name and the provider's host only — never
 * the provider's reply body or a key (SAFE-6 / SAFE-12). `provider` is the
 * entry that failed last (null for an empty chain: the no-provider notice).
 */
export function modelCallFailedLine(
  failure: ModelFailure | null,
  provider: Pick<ResolvedProvider, "baseUrl" | "entry"> | null,
): string {
  if (!provider) return NO_PROVIDER_NOTICE;
  const host = providerId(provider);
  if (!failure) return `The model call failed (${host})`;
  switch (failure.kind) {
    case "http": {
      const name = STATUS_CODES[failure.status];
      return `The model call failed (${failure.status}${name ? ` ${name}` : ""} from ${host})`;
    }
    case "timeout":
      return `The model call timed out (${host})`;
    case "network":
      return `The model call failed (network error reaching ${host})`;
    case "malformed":
      return `The model call failed (malformed reply from ${host})`;
    case "no-key":
      return `The model call failed (${entryLabel(provider.entry)} needs ${failure.keyEnv}, which is not set)`;
    case "skipped":
      return `The model call failed (${entryLabel(provider.entry)} was skipped: ${failure.why})`;
    case "exit":
      return `The model call failed (${entryLabel(provider.entry)} ${modelFailureReason(failure)})`;
  }
}

/**
 * A {@link modelCallFailedLine} line as a failure's one plain reason carries
 * it (`The model call failed|timed out (…)`), ending in the provider's host
 * (`… from <host>)`, `… reaching <host>)` or `(<host>)` alone), or in the
 * start of a host a 200-char cap cut (`…`). The no-key line (`(<model> needs
 * <ENV>, which is not set)`) has spaces where a host has none, so it never
 * matches.
 */
const MODEL_CALL_HOST_RE =
  /^(The model call (?:failed|timed out)) \((?:(.*?) (?:from|reaching) )?[^\s()]+(?:\)|…)$/;

/**
 * A failure's one plain reason line without the provider's host: a
 * {@link modelCallFailedLine} line keeps its status (`The model call failed
 * (429 Too Many Requests)`), since a host can be the account's own resource
 * name (`<resource>.openai.azure.com`), a private gateway or an Ollama
 * server's address. Any other line (the no-key line, the no-provider notice,
 * a verify line, a stderr line, an exit-code line) comes back as is. Shared
 * by WATCH's public comment (`watchPublicFailureLine`, REQ-watch-009) and a
 * failed delegate worker's or council voice's line for its lead
 * (`workerFailureLine`, REQ-agent-117).
 */
export function withoutProviderHost(reason: string): string {
  const m = MODEL_CALL_HOST_RE.exec(reason);
  if (!m) return reason;
  return m[2] ? `${m[1]} (${m[2]})` : m[1]!;
}

/**
 * One call to one configured model. `failure: null` means the call did not
 * fail as a model (a spend-cap stop, the run's own abort): the chain stops
 * there and never fails over.
 */
export type ChainCall<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      error: string;
      failure: ModelFailure | null;
      /**
       * AGENT-13.a: the chain stopped at a `cli` entry this attempt may run;
       * it takes the attempt over (src/agent/headless-cli.ts). Never a model
       * failure, and the chain stays on that entry.
       */
      handover?: true;
    };

/**
 * A tier's configured models in order, and which one calls go to now. One
 * per `task run` process (`createTaskExecute`), never stored: each process
 * tries the head once, then keeps the model it fell back to.
 */
export type ModelChain = {
  readonly entries: readonly ResolvedProvider[];
  /** Index of the entry calls go to now. */
  index: number;
  /** This chain's failovers so far, in order. */
  readonly fallbacks: ModelFallback[];
};

/** The chain of `tier` (its configured entries, resolved; AGENT-5 / AGENT-13). */
export function modelChain(env: NodeJS.ProcessEnv, tier: CapabilityTier): ModelChain {
  return {
    entries: modelChainForTier(env, tier).map((e) => resolveEntry(e, env)),
    index: 0,
    fallbacks: [],
  };
}

/**
 * AGENT-11: move `chain` past its current entry, which failed (or, AGENT-13.a,
 * was skipped) with `failure`: record the hop, call `onFallback` and keep the
 * next entry for every later call. False (nothing moves) when there is no
 * next entry.
 */
export function failOver(
  chain: ModelChain,
  failure: ModelFailure,
  onFallback?: (hop: ModelFallback) => void,
): boolean {
  const p = chain.entries[chain.index];
  const next = chain.entries[chain.index + 1];
  if (!p || !next) return false;
  const hop: ModelFallback = {
    from: entryLabel(p.entry),
    to: entryLabel(next.entry),
    reason: modelFailureReason(failure),
    ...(failure.kind === "skipped" ? { skipped: true as const } : {}),
  };
  chain.index += 1;
  chain.fallbacks.push(hop);
  onFallback?.(hop);
  return true;
}

/**
 * AGENT-13.a: whether this attempt may run a `cli` entry (the gate in
 * src/agent/headless-cli.ts), and if not, the fixed short reason its skip
 * names.
 */
export type CliTurnVerdict = { granted: true } | { granted: false; why: string };

/** The skip reason when no gate verdict was given (fail closed). */
export const CLI_SKIP_DEFAULT_WHY = "only in the owner's own runs, in that talk's worktree";

/** The error of a chain that ends on a `cli` entry it skipped (AGENT-13.a). */
export function cliSkippedError(entry: ModelEntry, why: string): string {
  return `${entryLabel(entry)} was not run: ${why} (AGENT-13.a), and no model is configured after it.`;
}

/**
 * Call the chain's current model with `fn` (AGENT-11). When it fails as a
 * model (`failure` set) and a next entry exists, record the failover, call
 * `onFallback` and go on at once with that entry — no retry, no backoff; the
 * chain keeps the new entry for every later call. A next entry whose key is
 * not set is skipped the same way without being called. A failure that is not
 * a model's (`failure: null`) or on the last entry comes back as it is.
 * `provider` is the entry the result came from (null for an empty chain).
 *
 * AGENT-13.a: `fn` is never called with a `cli` entry. When this attempt may
 * run it (`cli` granted) the chain stops there with `handover` (the CLI then
 * takes the attempt over); otherwise (refused, or no verdict given) it is
 * skipped like a keyless entry, its hop marked `skipped`.
 */
export async function callChain<T>(
  chain: ModelChain,
  fn: (provider: ResolvedProvider) => Promise<ChainCall<T>>,
  onFallback?: (hop: ModelFallback) => void,
  cli?: CliTurnVerdict,
): Promise<ChainCall<T> & { provider: ResolvedProvider | null }> {
  for (;;) {
    const p = chain.entries[chain.index];
    if (!p) return { ok: false, error: NO_PROVIDER_NOTICE, failure: null, provider: null };
    let r: ChainCall<T>;
    if (p.entry.kind === "cli") {
      if (cli?.granted) {
        return {
          ok: false,
          error: `${entryLabel(p.entry)} takes this attempt over (AGENT-13.a)`,
          failure: null,
          handover: true,
          provider: p,
        };
      }
      const why = cli && !cli.granted ? cli.why : CLI_SKIP_DEFAULT_WHY;
      r = { ok: false, error: cliSkippedError(p.entry, why), failure: { kind: "skipped", why } };
    } else {
      r = p.usable
        ? await fn(p)
        : {
            ok: false,
            error: `${entryLabel(p.entry)} needs ${p.keyEnv}, which is not set`,
            failure: { kind: "no-key", keyEnv: p.keyEnv ?? "its key" },
          };
    }
    if (r.ok || r.failure === null) return { ...r, provider: p };
    if (!failOver(chain, r.failure, onFallback)) return { ...r, provider: p };
  }
}

// ─── Model order (AGENT-17.a) ─────────────────────────────────────────────

/**
 * The optional order I set for AGENT-17.a, weakest first: a comma list of the
 * same `kind:model` entries as the model list. The fallback chain's own order
 * is not a strength order; unset or empty = no order, so a stalled run never
 * moves (the one nudge still happens). Never a price or benchmark ranking.
 */
export const MODEL_ORDER_ENV = "CORVIDINHO_LLM_MODEL_ORDER";

/** The configured model order (AGENT-17.a), weakest first; [] when unset. */
export function modelOrderFromEnv(env: NodeJS.ProcessEnv): ModelEntry[] {
  return parseModelChain(env[MODEL_ORDER_ENV]);
}

/** Why a stalled run stays on its model after the nudge (AGENT-17.a). */
export type StayReason = "no-order" | "unordered" | "top" | "unavailable";

/** Where a stalled run moves after the nudge (AGENT-17 / AGENT-17.a), or why it stays. */
export type StrongerModel =
  | { ok: true; index: number; from: string; to: string }
  | { ok: false; why: StayReason };

/**
 * AGENT-17 / AGENT-17.a: the stronger model a run on `chain` moves to — the
 * next entry after the chain's current model in `order` (weakest first) that
 * is one of the chain's own entries (the run's tier's model list), has its
 * key, and has not failed in this run; later ones in the order are tried in
 * turn when one is not available. Never a weaker or unordered model: with no
 * order (`no-order`), a current model not in the order (`unordered`), none
 * after it in the order (`top`) or none of those available (`unavailable`)
 * it stays. Pure: {@link moveToStronger} moves the chain.
 */
export function strongerModel(
  chain: ModelChain,
  order: readonly ModelEntry[],
): StrongerModel {
  if (order.length === 0) return { ok: false, why: "no-order" };
  const current = chain.entries[chain.index];
  if (!current) return { ok: false, why: "unavailable" };
  const from = entryLabel(current.entry);
  const ranked = order.map(entryLabel);
  const at = ranked.indexOf(from);
  if (at < 0) return { ok: false, why: "unordered" };
  const stronger = ranked.slice(at + 1).filter((label) => label !== from);
  if (stronger.length === 0) return { ok: false, why: "top" };
  const failed = new Set(chain.fallbacks.map((h) => h.from));
  for (const to of stronger) {
    if (failed.has(to)) continue;
    const index = chain.entries.findIndex(
      (p, i) => i !== chain.index && p.usable && entryLabel(p.entry) === to,
    );
    if (index >= 0) return { ok: true, index, from, to };
  }
  return { ok: false, why: "unavailable" };
}

/**
 * Move `chain` to its {@link strongerModel} for every later call of the run
 * (AGENT-17): the chain keeps that model, and a failure of it falls back
 * the usual way (AGENT-11). The chain is unchanged when it stays.
 */
export function moveToStronger(
  chain: ModelChain,
  order: readonly ModelEntry[],
): StrongerModel {
  const next = strongerModel(chain, order);
  if (next.ok) chain.index = next.index;
  return next;
}

/** What a run that moved to a stronger model did before the move (AGENT-17). */
export type StrongerMove = { from: string; to: string; kind: "plan" | "done-claim" };

/** Start of the closing note a run's summary carries after it moved to a stronger model. */
export const STRONGER_MODEL_NOTE_PREFIX = "(stronger model: ";

/**
 * The closing note of a run that moved to a stronger model (AGENT-17), one
 * plain line like the AGENT-11 fallback note, e.g. `(stronger model:
 * gpt-5-mini only planned after the nudge, so anthropic:claude-opus-5 took
 * over)`. Clips and message splits keep it (task-summary `closingNotesTail`).
 */
export function strongerModelNote(move: StrongerMove): string {
  const did = move.kind === "plan" ? "only planned" : "said it was done with nothing changed";
  return `${STRONGER_MODEL_NOTE_PREFIX}${oneLine(move.from)} ${did} after the nudge, so ${oneLine(move.to)} took over)`;
}

/**
 * `summary` with the stronger-model note after it, added once; it goes on
 * after the AGENT-11 fallback note and before every other closing note.
 */
export function withStrongerModelNote(summary: string, move: StrongerMove): string {
  const note = strongerModelNote(move);
  if (summary.includes(note)) return summary;
  const body = summary.trim();
  return body ? `${body}\n\n${note}` : note;
}

/** One line of text: whitespace runs collapsed (model ids come from env). */
function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function hopPrefix(hop: ModelFallback): string {
  return hop.via ? `${hop.via} worker: ` : "";
}

/** "failed", or "skipped" for an entry never called (AGENT-13.a). */
function hopVerb(hop: ModelFallback): string {
  return hop.skipped ? "skipped" : "failed";
}

/**
 * The live operator line for one failover (AGENT-11): a `Text` event, shown
 * by the CLI and streamed to bridges. A skipped `cli` entry (AGENT-13.a)
 * reads `skipped` instead of `failed`.
 */
export function modelFallbackEventText(hop: ModelFallback): string {
  return `[operator] ${hopPrefix(hop)}${oneLine(hop.from)} ${hopVerb(hop)} (${oneLine(hop.reason)}); falling back to ${oneLine(hop.to)}`;
}

/** Start of the closing note a run's summary carries after a failover. */
export const MODEL_FALLBACK_NOTE_PREFIX = "(model fallback: ";

/**
 * The closing note of a run that failed over (AGENT-11): every failover, one
 * line, e.g. `(model fallback: gpt-5 failed (HTTP 404), fell back to
 * anthropic:claude-sonnet-5)`. Clips keep it (task-summary
 * `clipKeepingRoleNote`), so every surface's reply carries it.
 */
export function modelFallbackNote(hops: readonly ModelFallback[]): string {
  return `${MODEL_FALLBACK_NOTE_PREFIX}${hopsText(hops)})`;
}

function hopsText(hops: readonly ModelFallback[]): string {
  return hops
    .map((h) => `${hopPrefix(h)}${oneLine(h.from)} ${hopVerb(h)} (${oneLine(h.reason)}), fell back to ${oneLine(h.to)}`)
    .join("; ");
}

/** `summary` with the failover note after it, added once. */
export function withModelFallbackNote(summary: string, hops: readonly ModelFallback[]): string {
  if (hops.length === 0) return summary;
  const note = modelFallbackNote(hops);
  if (summary.includes(note)) return summary;
  const body = summary.trim();
  return body ? `${body}\n\n${note}` : note;
}

/**
 * The bridge / daemon / WATCH log text for a run's failovers (`llm.fallback`,
 * AGENT-11): how the owner hears of one in a run that is not theirs.
 */
export function formatModelFallbackLog(hops: readonly ModelFallback[]): string {
  return `llm.fallback: ${hopsText(hops)}`;
}

/**
 * The model an answer footer names (AGENT-11): `answered`, and when this
 * run's own chain failed over, `answered (fell back from a, b)`. A worker's
 * failover (`via`) is not the answering model's and is left out.
 */
export function answeredModelLabel(
  answered: string,
  hops: readonly ModelFallback[] | undefined,
): string {
  const from: string[] = [];
  for (const h of hops ?? []) {
    if (h.via || h.from === answered || from.includes(h.from)) continue;
    from.push(h.from);
  }
  return from.length > 0 ? `${answered} (fell back from ${from.join(", ")})` : answered;
}

/**
 * The model id a label prices at (`body.model`: the label without its
 * `kind:`). A `cli` entry sends no `body.model` and has no known price
 * (AGENT-13, SAFE-16), so its id is its whole label: `cli:gpt-5` never
 * prices as `gpt-5`.
 */
export function modelIdOfLabel(label: string): string {
  const e = parseModelEntry(label);
  if (!e) return label.trim();
  return e.kind === "cli" ? entryLabel(e) : e.model;
}

/** Failovers kept on a result or tool data; more are dropped. */
export const MODEL_FALLBACK_MAX = 16;
/** Longest label or reason kept when a child's result is read back. */
export const MODEL_FIELD_MAX = 200;

function boundedField(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = oneLine(scrubSecrets(v));
  return s ? s.slice(0, MODEL_FIELD_MAX) : null;
}

/**
 * A model label read back from a child's result (`TaskResult.model`):
 * scrubbed, one line, bounded; undefined when absent or blank.
 */
export function modelLabelFromUnknown(v: unknown): string | undefined {
  return boundedField(v) ?? undefined;
}

/**
 * Validate failovers read back from a child's result frame or tool data (a
 * delegate / council worker, a spawned `task run`): scrubbed, one-line,
 * bounded, at most {@link MODEL_FALLBACK_MAX}. Undefined when none is valid.
 */
export function modelFallbackFromUnknown(v: unknown): ModelFallback[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: ModelFallback[] = [];
  for (const item of v) {
    if (out.length >= MODEL_FALLBACK_MAX) break;
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const from = boundedField(r.from);
    const to = boundedField(r.to);
    const reason = boundedField(r.reason);
    if (!from || !to || !reason) continue;
    const hop: ModelFallback = { from, to, reason };
    if (r.via === "delegate" || r.via === "council") hop.via = r.via;
    if (r.skipped === true) hop.skipped = true;
    out.push(hop);
  }
  return out.length > 0 ? out : undefined;
}

/** `list` plus the hops of `add` not in it yet (same from, to, reason, via). */
export function mergeModelFallbacks(
  list: readonly ModelFallback[],
  add: readonly ModelFallback[],
): ModelFallback[] {
  const out = [...list];
  for (const h of add) {
    if (out.length >= MODEL_FALLBACK_MAX) break;
    if (
      out.some(
        (o) =>
          o.from === h.from && o.to === h.to && o.reason === h.reason && o.via === h.via && o.skipped === h.skipped,
      )
    ) {
      continue;
    }
    out.push(h);
  }
  return out;
}

function tokenCount(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
}

/**
 * Validate per-model usage read back from a child's frame (AGENT-11):
 * `{ model, promptTokens, completionTokens, totalTokens }` rows, at most
 * {@link MODEL_FALLBACK_MAX} + 1. Undefined when none is valid.
 */
export function modelUsageFromUnknown(v: unknown): ModelUsage[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: ModelUsage[] = [];
  for (const item of v) {
    if (out.length > MODEL_FALLBACK_MAX) break;
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const model = boundedField(r.model);
    const promptTokens = tokenCount(r.promptTokens);
    const completionTokens = tokenCount(r.completionTokens);
    const totalTokens = tokenCount(r.totalTokens);
    if (!model || promptTokens === null || completionTokens === null || totalTokens === null) continue;
    out.push({ model, promptTokens, completionTokens, totalTokens });
  }
  return out.length > 0 ? out : undefined;
}

/** Add `usage` to `model`'s row of `rows` (a new row at the end when none). */
export function addModelUsage(rows: ModelUsage[], model: string, usage: AgentTokenUsage): void {
  const row = rows.find((r) => r.model === model);
  if (row) {
    row.promptTokens += usage.promptTokens;
    row.completionTokens += usage.completionTokens;
    row.totalTokens += usage.totalTokens;
  } else {
    rows.push({ model, ...usage });
  }
}

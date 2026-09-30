/**
 * Model providers (AGENT-13, AGENT-10): the operator configures every model
 * the agent calls, and nothing is built in as a default.
 *
 * `CORVIDINHO_LLM_MODEL` and the per-tier keys (`CORVIDINHO_LLM_MODEL_READ`,
 * `_TOOL`, `_CODE`, AGENT-5) each hold a comma-separated list of entries. An
 * entry is `kind:model` with kind `openai`, `ollama` or `anthropic`; a bare
 * entry, or one whose prefix is not a kind (`qwen3:30b`), is OpenAI-compatible.
 * Only the first entry of a tier is called for now; the fallback chain
 * (AGENT-11) is a later change.
 *
 * Each kind has its vendor endpoint (the endpoint of a provider the operator
 * chose, not a default model):
 * - `openai`: `CORVIDINHO_LLM_BASE_URL` (else `https://api.openai.com/v1`),
 *   key `CORVIDINHO_LLM_API_KEY` or `OPENAI_API_KEY`.
 * - `ollama`: `OLLAMA_HOST` (else `127.0.0.1:11434`), its OpenAI-compatible
 *   `/v1` API, no key.
 * - `anthropic`: `https://api.anthropic.com/v1` (its OpenAI-compatible API),
 *   key `ANTHROPIC_API_KEY`.
 * All of them go through the one chat-completions transport and the SAFE-8
 * spend guard. With no usable entry a run fails with the no-provider notice.
 * Keys are read from env only and never printed (SAFE-6).
 */

import { loadTierFromEnv, TIER_MODEL_ENV, type CapabilityTier } from "./tier.ts";

export const PROVIDER_KINDS = ["openai", "ollama", "anthropic"] as const;
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
      const model = s.slice(i + 1).trim();
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
  if (entry.kind === "ollama") baseUrl = `${ollamaHostUrl(env)}/v1`;
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

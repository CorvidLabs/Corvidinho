/**
 * Capability tiers (AGENT-5 / Merlin steal).
 * Read = text only; Tool/Code expose plugins filtered by minTier.
 * Numeric plugin minTier: 0 = read floor, 1 = tool, 2+ = code.
 */

import { entryModelId, modelChainForTier, parseModelChain } from "./providers.ts";

export type CapabilityTier = "read" | "tool" | "code";

const RANK: Record<CapabilityTier, number> = {
  read: 0,
  tool: 1,
  code: 2,
};

export function parseCapabilityTier(
  raw: string | undefined,
  fallback: CapabilityTier = "tool",
): CapabilityTier {
  if (raw == null || !raw.trim()) return fallback;
  const s = raw.trim().toLowerCase();
  if (s === "read" || s === "tool" || s === "code") return s;
  return fallback;
}

/** True when the provider tier is high enough for a plugin's minTier. */
export function tierAllowsPlugin(
  providerTier: CapabilityTier,
  minTier: number,
): boolean {
  if (providerTier === "read") return false;
  const need = Number.isFinite(minTier) ? Math.max(0, Math.floor(minTier)) : 0;
  return RANK[providerTier] >= need;
}

/**
 * Optional per-tier model keys (AGENT-5): a tier's key wins, else
 * `CORVIDINHO_LLM_MODEL`. Each holds provider entries (`kind:model`, AGENT-13,
 * src/agent/providers.ts); there is no built-in default model.
 */
export const TIER_MODEL_ENV: Readonly<Record<CapabilityTier, string>> = {
  read: "CORVIDINHO_LLM_MODEL_READ",
  tool: "CORVIDINHO_LLM_MODEL_TOOL",
  code: "CORVIDINHO_LLM_MODEL_CODE",
};

/**
 * The model id a run at `tier` sends as `body.model` (AGENT-5 / AGENT-13):
 * the first entry of the tier's key, else of `CORVIDINHO_LLM_MODEL`, without
 * its `kind:` prefix. "" when no model is configured (no default). A `cli`
 * entry sends none and has no known price, so it is its whole label
 * (`modelIdOfLabel`).
 */
export function modelForTier(
  env: NodeJS.ProcessEnv,
  tier: CapabilityTier,
): string {
  const head = modelChainForTier(env, tier)[0];
  return head ? entryModelId(head) : "";
}

/**
 * The env key that sets a `tier` run's model (AGENT-5): the tier's key when
 * it lists an entry, else `CORVIDINHO_LLM_MODEL`. Named in the SAFE-8
 * unpriced-model ask.
 */
export function modelKeyForTier(
  env: NodeJS.ProcessEnv,
  tier: CapabilityTier,
): string {
  const key = TIER_MODEL_ENV[tier];
  return parseModelChain(env[key]).length > 0 ? key : "CORVIDINHO_LLM_MODEL";
}

/**
 * Each tier's model when any per-tier model key lists an entry (AGENT-5),
 * else null (every tier calls the one configured model). A tier with no
 * model is "".
 */
export function perTierModels(
  env: NodeJS.ProcessEnv,
): Readonly<Record<CapabilityTier, string>> | null {
  const tiers = Object.keys(TIER_MODEL_ENV) as CapabilityTier[];
  if (!tiers.some((t) => parseModelChain(env[TIER_MODEL_ENV[t]]).length > 0)) return null;
  return {
    read: modelForTier(env, "read"),
    tool: modelForTier(env, "tool"),
    code: modelForTier(env, "code"),
  };
}

export function loadTierFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fallback: CapabilityTier = "tool",
): CapabilityTier {
  return parseCapabilityTier(env.CORVIDINHO_LLM_TIER, fallback);
}

export { RANK as TIER_RANK };

/**
 * Capability tiers (AGENT-5 / Merlin steal).
 * Read = text only; Tool/Code expose plugins filtered by minTier.
 * Numeric plugin minTier: 0 = read floor, 1 = tool, 2+ = code.
 */

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

export function loadTierFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fallback: CapabilityTier = "tool",
): CapabilityTier {
  return parseCapabilityTier(env.CORVIDINHO_LLM_TIER, fallback);
}

export { RANK as TIER_RANK };

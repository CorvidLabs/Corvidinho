/**
 * SESSION-2 soft TTL: ~30–60 minutes; default 45m.
 * Env: CORVIDINHO_SESSION_TTL_MS (clamped to band).
 */

export const SESSION_TTL_MIN_MS = 30 * 60 * 1000;
export const SESSION_TTL_MAX_MS = 60 * 60 * 1000;
export const SESSION_TTL_DEFAULT_MS = 45 * 60 * 1000;

export function clampSessionTtlMs(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return SESSION_TTL_DEFAULT_MS;
  return Math.min(SESSION_TTL_MAX_MS, Math.max(SESSION_TTL_MIN_MS, Math.floor(ms)));
}

export function resolveSessionTtlMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.CORVIDINHO_SESSION_TTL_MS?.trim();
  if (!raw) return SESSION_TTL_DEFAULT_MS;
  const n = Number(raw);
  return clampSessionTtlMs(n);
}

export function isSessionExpired(
  lastActivityAt: number,
  opts: { ttlMs: number; nowMs: number },
): boolean {
  return opts.nowMs - lastActivityAt > opts.ttlMs;
}

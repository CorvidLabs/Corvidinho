/**
 * WATCH-RELIABILITY-3 — GitHub 403 rate-limit backoff.
 * Prefer Retry-After / x-ratelimit-reset; else documented default.
 */

export const DEFAULT_RATE_LIMIT_BACKOFF_MS = 60_000;
export const MIN_RATE_LIMIT_BACKOFF_MS = 1_000;
export const MAX_RATE_LIMIT_BACKOFF_MS = 3_600_000;

export type RateLimitHeaders = Record<string, string | string[] | undefined>;

export type RateLimitBackoff = {
  waitMs: number;
  reason: string;
  retryAfterHeader?: string;
  resetHeader?: string;
};

export class GithubRateLimitError extends Error {
  readonly status: number;
  readonly headers: RateLimitHeaders;
  readonly waitMs: number;
  readonly reason: string;

  constructor(opts: {
    message: string;
    status?: number;
    headers?: RateLimitHeaders;
    waitMs: number;
    reason: string;
  }) {
    super(opts.message);
    this.name = "GithubRateLimitError";
    this.status = opts.status ?? 403;
    this.headers = opts.headers ?? {};
    this.waitMs = opts.waitMs;
    this.reason = opts.reason;
  }
}

function headerValue(
  headers: RateLimitHeaders | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const key = Object.keys(headers).find(
    (k) => k.toLowerCase() === name.toLowerCase(),
  );
  if (!key) return undefined;
  const v = headers[key];
  if (Array.isArray(v)) return v[0];
  return typeof v === "string" ? v : undefined;
}

function clampWait(ms: number): number {
  if (!Number.isFinite(ms) || ms < MIN_RATE_LIMIT_BACKOFF_MS) {
    return DEFAULT_RATE_LIMIT_BACKOFF_MS;
  }
  return Math.min(Math.max(Math.ceil(ms), MIN_RATE_LIMIT_BACKOFF_MS), MAX_RATE_LIMIT_BACKOFF_MS);
}

/**
 * Compute backoff from GitHub rate-limit headers.
 * Order: Retry-After (seconds or HTTP-date) → x-ratelimit-reset → default 60s.
 */
export function computeRateLimitBackoffMs(
  headers: RateLimitHeaders | undefined,
  nowMs: number = Date.now(),
  defaultMs: number = DEFAULT_RATE_LIMIT_BACKOFF_MS,
): RateLimitBackoff {
  const retryAfter = headerValue(headers, "retry-after");
  if (retryAfter) {
    const asSec = Number.parseInt(retryAfter.trim(), 10);
    if (Number.isFinite(asSec) && asSec >= 0) {
      return {
        waitMs: clampWait(asSec * 1000),
        reason: "retry-after-seconds",
        retryAfterHeader: retryAfter,
      };
    }
    const asDate = Date.parse(retryAfter);
    if (Number.isFinite(asDate)) {
      return {
        waitMs: clampWait(asDate - nowMs),
        reason: "retry-after-http-date",
        retryAfterHeader: retryAfter,
      };
    }
  }

  const reset = headerValue(headers, "x-ratelimit-reset");
  if (reset) {
    const resetSec = Number.parseInt(reset.trim(), 10);
    if (Number.isFinite(resetSec) && resetSec > 0) {
      return {
        waitMs: clampWait(resetSec * 1000 - nowMs),
        reason: "x-ratelimit-reset",
        resetHeader: reset,
      };
    }
  }

  return {
    waitMs: clampWait(defaultMs),
    reason: "default",
  };
}

function looksLikeRateLimitMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("rate limit") ||
    m.includes("rate-limit") ||
    m.includes("secondary rate") ||
    m.includes("api rate limit exceeded") ||
    m.includes("abuse detection")
  );
}

/**
 * Detect a GitHub 403 (or 429) rate-limit error and compute backoff.
 * Returns null when the error is not a rate-limit.
 */
export function parseGithubRateLimit(
  err: unknown,
  nowMs: number = Date.now(),
  defaultMs: number = DEFAULT_RATE_LIMIT_BACKOFF_MS,
): RateLimitBackoff | null {
  if (err instanceof GithubRateLimitError) {
    return {
      waitMs: err.waitMs,
      reason: err.reason,
    };
  }

  if (!err || typeof err !== "object") return null;

  const e = err as {
    status?: number;
    message?: string;
    response?: { status?: number; headers?: RateLimitHeaders };
    headers?: RateLimitHeaders;
  };

  const status = e.status ?? e.response?.status;
  if (status !== 403 && status !== 429) return null;

  const headers = e.headers ?? e.response?.headers;
  const msg = typeof e.message === "string" ? e.message : String(err);
  const remaining = headerValue(headers, "x-ratelimit-remaining");
  const hasRetryAfter = !!headerValue(headers, "retry-after");
  const remainingZero = remaining === "0";

  if (
    status === 429 ||
    remainingZero ||
    hasRetryAfter ||
    looksLikeRateLimitMessage(msg)
  ) {
    return computeRateLimitBackoffMs(headers, nowMs, defaultMs);
  }

  // Bare 403 without rate-limit signal — not our backoff case.
  return null;
}

export function formatRateLimitLog(
  backoff: RateLimitBackoff,
  untilMs: number,
): string {
  const untilIso = new Date(untilMs).toISOString();
  return (
    `[watch] github rate-limit backoff ms=${backoff.waitMs} ` +
    `until=${untilIso} reason=${backoff.reason}`
  );
}

/**
 * Wrap an unknown thrown value from Octokit into GithubRateLimitError when
 * it is a 403/429 rate-limit; otherwise rethrow as-is (caller decides).
 */
export function asGithubRateLimitError(
  err: unknown,
  nowMs: number = Date.now(),
): GithubRateLimitError | null {
  const parsed = parseGithubRateLimit(err, nowMs);
  if (!parsed) return null;
  const e = err as { status?: number; message?: string; response?: { headers?: RateLimitHeaders }; headers?: RateLimitHeaders };
  return new GithubRateLimitError({
    message: typeof e.message === "string" ? e.message : "GitHub rate limit",
    status: e.status ?? 403,
    headers: e.headers ?? e.response?.headers,
    waitMs: parsed.waitMs,
    reason: parsed.reason,
  });
}

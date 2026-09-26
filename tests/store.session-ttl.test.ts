import { describe, expect, test } from "bun:test";
import {
  SESSION_TTL_DEFAULT_MS,
  SESSION_TTL_MAX_MS,
  SESSION_TTL_MIN_MS,
  clampSessionTtlMs,
  isSessionExpired,
  resolveSessionTtlMs,
} from "../src/store/session-ttl.ts";

describe("session soft TTL (SESSION-2)", () => {
  test("default is 45 minutes within 30–60 band", () => {
    expect(SESSION_TTL_DEFAULT_MS).toBe(45 * 60 * 1000);
    expect(SESSION_TTL_DEFAULT_MS).toBeGreaterThanOrEqual(SESSION_TTL_MIN_MS);
    expect(SESSION_TTL_DEFAULT_MS).toBeLessThanOrEqual(SESSION_TTL_MAX_MS);
  });

  test("clamp keeps values inside 30–60m", () => {
    expect(clampSessionTtlMs(5 * 60 * 1000)).toBe(SESSION_TTL_MIN_MS);
    expect(clampSessionTtlMs(90 * 60 * 1000)).toBe(SESSION_TTL_MAX_MS);
    expect(clampSessionTtlMs(40 * 60 * 1000)).toBe(40 * 60 * 1000);
  });

  test("env CORVIDINHO_SESSION_TTL_MS is clamped", () => {
    expect(resolveSessionTtlMs({})).toBe(SESSION_TTL_DEFAULT_MS);
    expect(
      resolveSessionTtlMs({ CORVIDINHO_SESSION_TTL_MS: String(10 * 60 * 1000) }),
    ).toBe(SESSION_TTL_MIN_MS);
  });

  test("isSessionExpired", () => {
    const ttlMs = 45 * 60 * 1000;
    const nowMs = 1_000_000;
    expect(
      isSessionExpired(nowMs - ttlMs - 1, { ttlMs, nowMs }),
    ).toBe(true);
    expect(isSessionExpired(nowMs - ttlMs + 1, { ttlMs, nowMs })).toBe(false);
  });
});

/**
 * Cadence / min-interval (DISCORD-SCHEDULE / ADR-001 5m).
 */
import { describe, expect, test } from "bun:test";
import {
  CadenceError,
  MIN_SCHEDULE_INTERVAL_MS,
  getNextCronDate,
  resolveCadence,
  validateAndResolveCadence,
} from "../src/scheduler/cron.ts";

describe("resolveCadence", () => {
  test("presets and every-hour aliases", () => {
    expect(resolveCadence("@hourly")).toBe("0 * * * *");
    expect(resolveCadence("every hour")).toBe("0 * * * *");
    expect(resolveCadence("@daily")).toBe("0 0 * * *");
    expect(resolveCadence("every 6 hours")).toBe("0 */6 * * *");
  });

  test("every N minutes >= 5", () => {
    expect(resolveCadence("every 5 minutes")).toBe("*/5 * * * *");
    expect(resolveCadence("every 15 mins")).toBe("*/15 * * * *");
  });

  test("rejects every N minutes < 5", () => {
    expect(() => resolveCadence("every 1 minute")).toThrow(CadenceError);
    expect(() => resolveCadence("every 4 minutes")).toThrow(/5 minutes/);
  });

  test("passes through valid cron", () => {
    expect(resolveCadence("0 9 * * 1")).toBe("0 9 * * 1");
  });
});

describe("validateAndResolveCadence (min 5m)", () => {
  test("accepts @hourly and every 5 minutes", () => {
    expect(validateAndResolveCadence("@hourly")).toBe("0 * * * *");
    expect(validateAndResolveCadence("every 5 minutes")).toBe("*/5 * * * *");
    expect(MIN_SCHEDULE_INTERVAL_MS).toBe(300_000);
  });

  test("rejects cron that fires every minute", () => {
    expect(() => validateAndResolveCadence("* * * * *")).toThrow(/5 minutes/);
  });

  test("getNextCronDate advances", () => {
    const from = new Date("2026-09-26T12:00:00Z");
    const next = getNextCronDate("0 * * * *", from);
    expect(next.getTime()).toBeGreaterThan(from.getTime());
  });
});

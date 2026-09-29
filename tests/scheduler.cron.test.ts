/**
 * Cadence / min-interval (DISCORD-SCHEDULE / ADR-001 5m).
 */
import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  CadenceError,
  MIN_SCHEDULE_INTERVAL_MS,
  getNextCronDate,
  parseCron,
  resolveCadence,
  validateAndResolveCadence,
} from "../src/scheduler/cron.ts";

const CRON_TS = resolve(import.meta.dir, "../src/scheduler/cron.ts");
const FROM = "2026-09-26T12:00:00Z";
/** Generous: the box running the suite can be loaded; a hang never ends. */
const CHILD_TIMEOUT_MS = 10_000;

type Outcome = { value?: string; error?: { name: string; message: string } };
type ChildResult = {
  exitCode: number | null;
  stderr: string;
  resolve?: Outcome;
  next?: Outcome;
};

/**
 * Validate `cadence` (the /schedule create path) and compute its next run
 * (the store create / resume / claim path) in a child bun with a hard
 * timeout. A parser that loops forever gets the child killed, so the test
 * fails instead of hanging the runner (W12 zero cron step).
 */
function cadenceInChild(cadence: string): ChildResult {
  const script = `
    import { getNextCronDate, validateAndResolveCadence } from ${JSON.stringify(CRON_TS)};
    const run = (fn) => {
      try { return { value: fn() }; }
      catch (e) { return { error: { name: e?.name, message: e?.message } }; }
    };
    const cadence = process.env.CADENCE;
    const from = new Date(process.env.FROM);
    console.log(JSON.stringify({
      resolve: run(() => validateAndResolveCadence(cadence)),
      next: run(() => getNextCronDate(cadence, from).toISOString()),
    }));
  `;
  const p = Bun.spawnSync([process.execPath, "-e", script], {
    env: { ...process.env, CADENCE: cadence, FROM },
    stdout: "pipe",
    stderr: "pipe",
    timeout: CHILD_TIMEOUT_MS,
  });
  const out = p.stdout.toString().trim();
  const parsed = p.exitCode === 0 && out ? JSON.parse(out) : {};
  return { exitCode: p.exitCode, stderr: p.stderr.toString(), ...parsed };
}

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

describe("cron step and range forms never hang (W12 zero step, REQ-discord-020)", () => {
  // Each of these hung main's parser in /schedule create (the bridge parses
  // cadences synchronously) and in the store's next-run computation.
  test.each([
    "*/0 * * * *",
    "0-59/0 * * * *",
    "0,*/0 * * * *",
    "0 */0 * * *",
    "0 0 1-31/0 * *",
    "0 0 * */0 *",
    "0 0 * * 1-5/0",
  ])(
    "zero step %p is a CadenceError, not a hang",
    (cadence) => {
      const r = cadenceInChild(cadence);
      expect(r.stderr).toBe("");
      expect(r.exitCode).toBe(0);
      expect(r.resolve?.error?.name).toBe("CadenceError");
      expect(r.resolve?.error?.message).toMatch(/cron step .*must be 1 or more/);
      expect(r.next?.error?.name).toBe("CadenceError");
    },
    CHILD_TIMEOUT_MS * 3,
  );

  test("a zero step on a single value (5/0) is refused too", () => {
    expect(() => validateAndResolveCadence("5/0 * * * *")).toThrow(CadenceError);
    expect(() => parseCron("5/0 * * * *")).toThrow(/cron step in "5\/0"/);
    expect(() => getNextCronDate("0 5/0 * * *")).toThrow(CadenceError);
  });

  test(
    "a range past the field max is bounded there (huge end, end past 2^53)",
    () => {
      // Every minute once bounded: the existing 5-minute rule refuses it.
      const huge = cadenceInChild("0-99999999999 * * * *");
      expect(huge.exitCode).toBe(0);
      expect(huge.resolve?.error?.name).toBe("CadenceError");
      expect(huge.resolve?.error?.message).toMatch(/Minimum interval is 5 minutes/);

      // Past 2^53 `i += 1` stops moving; nothing in range, so no run date.
      const unsafe = cadenceInChild("9007199254740992-9007199254740993 * * * *");
      expect(unsafe.exitCode).toBe(0);
      expect(unsafe.resolve?.error?.name).toBe("CadenceError");
      expect(unsafe.next?.error?.message).toMatch(/No matching cron date/);

      // In-range values keep their meaning: same runs as `0 */2 * * *`.
      const stepped = cadenceInChild("0 0-99999999999/2 * * *");
      expect(stepped.exitCode).toBe(0);
      expect(stepped.resolve?.value).toBe("0 0-99999999999/2 * * *");
      expect(stepped.next?.value).toBe(
        getNextCronDate("0 */2 * * *", new Date(FROM)).toISOString(),
      );
    },
    CHILD_TIMEOUT_MS * 4,
  );

  test("cadences with a step of 1 or more resolve as before", () => {
    for (const cron of [
      "*/5 * * * *",
      "10-50/10 * * * *",
      "0 */6 * * *",
      "0 9 * * 1-5",
      "0 22-23 * * *",
      "0 0 1,15 * *",
      "0 0 * * 0-7",
      "0 0 1 1-12/3 *",
    ]) {
      expect(validateAndResolveCadence(cron)).toBe(cron);
    }
    expect(validateAndResolveCadence("every 5 minutes")).toBe("*/5 * * * *");
    expect(validateAndResolveCadence("every 2 hours")).toBe("0 */2 * * *");
  });
});

/**
 * AGENT-4.a (REQ-agent-002): the verify output a retry sends the model keeps
 * the failing step's output, not the first 4000 chars of the lane log.
 */
import { describe, expect, test } from "bun:test";
import {
  VERIFY_FEEDBACK_MAX_CHARS,
  verifyFeedbackExcerpt,
} from "../src/agent/verify.ts";
import {
  failingLaneLog,
  HELP_HEAD,
  LANE_FAILED_LINE,
  noisyFailingLaneLog,
} from "./fixtures/verify-lane-log.ts";

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

describe("verifyFeedbackExcerpt (AGENT-4.a, REQ-agent-002)", () => {
  test("output within the cap is returned unchanged", () => {
    // tests/agent.loop.test.ts and tests/agent.tool-loop.test.ts assert this cap as 4000.
    expect(VERIFY_FEEDBACK_MAX_CHARS).toBe(4000);
    expect(verifyFeedbackExcerpt("lint boom")).toBe("lint boom");
    const exact = "e".repeat(VERIFY_FEEDBACK_MAX_CHARS);
    expect(verifyFeedbackExcerpt(exact)).toBe(exact);
    expect(verifyFeedbackExcerpt("short", 10)).toBe("short");
  });

  test("passing steps that fill the first 4000 chars: the failing test step is kept whole", () => {
    const { log } = failingLaneLog();
    // The fixture reproduces the gap: the head cut is all lane header + --help.
    expect(log.length).toBeGreaterThan(VERIFY_FEEDBACK_MAX_CHARS);
    expect(log.slice(0, VERIFY_FEEDBACK_MAX_CHARS)).not.toContain("error:");

    const out = verifyFeedbackExcerpt(log);
    expect(out.length).toBeLessThanOrEqual(VERIFY_FEEDBACK_MAX_CHARS);
    expect(out).toContain("Failing step: test (step 3 of lane 'verify')");
    expect(out).toContain("  ▶️ Running task: test\n");
    expect(out).toContain("error: expect(received).toBe(expected)");
    expect(out).toContain("Expected: 7\nReceived: 6");
    expect(out).toContain("(fail) sum of three");
    expect(out).toContain(LANE_FAILED_LINE);
    expect(out).not.toContain(HELP_HEAD);
    expect(out).not.toContain("Running task: smoke");
  });

  test("a failing step over the cap keeps its first error lines and the end of the log", () => {
    const log = noisyFailingLaneLog();
    expect(log.length).toBeGreaterThan(4 * VERIFY_FEEDBACK_MAX_CHARS);
    const out = verifyFeedbackExcerpt(log);
    expect(out.length).toBeLessThanOrEqual(VERIFY_FEEDBACK_MAX_CHARS);
    expect(out).toContain("Failing step: test (step 3 of lane 'verify')");
    // The first failure, from the middle of the log, as error lines.
    expect(out).toContain("Error lines from the failing step:\n");
    expect(out).toContain("error: expect(received).toBe(expected) FIRST-FAILURE");
    expect(out).toContain("Expected: 5\nReceived: 4");
    expect(out).toContain("(fail) first real failure");
    // The end of the log: the second failure, the summary, fledge's line.
    expect(out).toContain("… end of the verify output:\n");
    expect(out).toContain("error: expect(received).toEqual(expected) SECOND-FAILURE");
    expect(out).toContain(" 2 fail");
    expect(out.endsWith(`${LANE_FAILED_LINE}\n`)).toBe(true);
    // Passing tests named "… fails …" are not error lines; the head is gone.
    const errorBlock = out.slice(
      out.indexOf("Error lines from the failing step:"),
      out.indexOf("… end of the verify output:"),
    );
    expect(errorBlock).not.toContain("(pass)");
    expect(out).not.toContain(HELP_HEAD);
  });

  test("no fledge markers (another runner): the end of the output within the cap", () => {
    const log = `${"setup line\n".repeat(600)}FATAL: build broke at the end\n`;
    const out = verifyFeedbackExcerpt(log);
    expect(out.length).toBeLessThanOrEqual(VERIFY_FEEDBACK_MAX_CHARS);
    expect(out).not.toContain("Failing step:");
    expect(out.endsWith("FATAL: build broke at the end\n")).toBe(true);
  });

  test("never over the cap, never half a surrogate pair", () => {
    const { log } = failingLaneLog();
    const emoji = "🐦".repeat(3000);
    const inputs = [
      log,
      noisyFailingLaneLog(40),
      `${emoji}\n${log}`,
      `${log}${emoji}`,
      `  ▶️ Running task: test\n${"error 🐦 ".repeat(900)}\n${emoji}`,
      `${"🐦".repeat(2500)}error: ${"🐦".repeat(400)}\n${LANE_FAILED_LINE}\n${"🐦".repeat(2500)}`,
    ];
    for (const input of inputs) {
      for (const max of [80, 200, 1000, 3946, VERIFY_FEEDBACK_MAX_CHARS, 5001]) {
        const out = verifyFeedbackExcerpt(input, max);
        expect(out.length).toBeLessThanOrEqual(max);
        expect(LONE_SURROGATE.test(out)).toBe(false);
      }
    }
  });
});

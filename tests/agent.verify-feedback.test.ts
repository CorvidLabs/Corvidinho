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
  chattyFailingLaneLog,
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

  test("log lines that only mention a failure do not crowd out the failure itself", () => {
    // Corvidinho's own bun test: console chatter on stdout (after the marker)
    // says "marked failed" / "error_class=ok"; the real failure is on stderr,
    // in the middle, with more stderr after it.
    const log = chattyFailingLaneLog();
    const out = verifyFeedbackExcerpt(log);
    expect(out.length).toBeLessThanOrEqual(VERIFY_FEEDBACK_MAX_CHARS);
    expect(out).toContain("Failing step: test (step 3 of lane 'verify')");
    expect(out).toContain("error: expect(received).toBe(expected)");
    expect(out).toContain("Expected: 7\nReceived: 6");
    expect(out).toContain("(fail) sum of three");
    expect(out.endsWith(`${LANE_FAILED_LINE}\n`)).toBe(true);
    // Kept error lines are printed in log order: chatter that fits comes
    // before the failure it preceded.
    const errorBlock = out.slice(
      out.indexOf("Error lines from the failing step:"),
      out.indexOf("… end of the verify output:"),
    );
    expect(errorBlock.indexOf("marked failed")).toBeLessThan(errorBlock.indexOf("(fail) sum of three"));
  });

  test("no fledge markers (another runner): the end of the output within the cap", () => {
    const log = `${"setup line\n".repeat(600)}FATAL: build broke at the end\n`;
    const out = verifyFeedbackExcerpt(log);
    expect(out.length).toBeLessThanOrEqual(VERIFY_FEEDBACK_MAX_CHARS);
    expect(out).not.toContain("Failing step:");
    // It does not claim to be a failing step's output it could not find.
    expect(out).not.toContain("failing step");
    expect(out.endsWith("FATAL: build broke at the end\n")).toBe(true);
  });

  test("colour escapes (FORCE_COLOR reaching the lane) are dropped and do not hide the markers", () => {
    const esc = "\u001b";
    const marker = (task: string) =>
      `  ${esc}[36m${esc}[1m▶️${esc}[0m ${esc}[1mRunning task: ${task}${esc}[0m\n`;
    const passing: string[] = [];
    for (let i = 0; i < 80; i++) {
      passing.push(`${esc}[32m(pass)${esc}[0m store > case ${i} fails closed when locked ${esc}[2m[0.10ms]${esc}[0m`);
    }
    const log =
      marker("lint") +
      `${HELP_HEAD}\n`.repeat(90) +
      marker("test") +
      `${passing.join("\n")}\n${esc}[31merror${esc}[0m: expect(received).toBe(expected) COLOURED\n` +
      `${esc}[31m(fail)${esc}[0m coloured failure\n` +
      "tests/later.test.ts:\n".repeat(200) +
      `${esc}[31m${esc}[1merror:${esc}[0m ${LANE_FAILED_LINE.slice("error: ".length)}\n`;
    const out = verifyFeedbackExcerpt(log);
    expect(out.length).toBeLessThanOrEqual(VERIFY_FEEDBACK_MAX_CHARS);
    expect(out).not.toContain(esc);
    expect(out).toContain("Failing step: test (step 3 of lane 'verify')");
    expect(out).toContain("error: expect(received).toBe(expected) COLOURED");
    expect(out).toContain("(fail) coloured failure");
    // Coloured passing tests named "… fails …" are not error lines.
    const errorBlock = out.slice(
      out.indexOf("Error lines from the failing step:"),
      out.indexOf("… end of the verify output:"),
    );
    expect(errorBlock).toContain("(fail) coloured failure");
    expect(errorBlock).not.toContain("(pass)");
    expect(out).not.toContain(HELP_HEAD);
  });

  test("a failing parallel step is named whole and starts at its Running parallel line", () => {
    const log =
      "▶️ Lane: verify — (no description)\n" +
      "  ▶️ Running task: setup\n" +
      `${HELP_HEAD}\n`.repeat(90) +
      "  ✔ Step 1 done (5ms)\n" +
      "  ▶️ Running parallel: lint, test\n" +
      "  ▶️ Running task: lint\n" +
      "src/a.ts(3,5): error TS2322: Type 'string' is not assignable to type 'number'.\n" +
      "  ▶️ Running task: test\n" +
      "bun test v1.4.2 (744846f84)\n" +
      "error: Lane 'verify' failed at step 2 (parallel(lint, test)) after 291ms: Parallel step failed:\n" +
      "  lint: Task 'lint' failed with exit code 2\n";
    const out = verifyFeedbackExcerpt(log);
    expect(out.length).toBeLessThanOrEqual(VERIFY_FEEDBACK_MAX_CHARS);
    expect(out).toContain("Failing step: parallel(lint, test) (step 2 of lane 'verify')");
    // Both of the step's tasks, from the parallel marker on.
    expect(out).toContain("  ▶️ Running parallel: lint, test\n");
    expect(out).toContain("error TS2322");
    expect(out).not.toContain(HELP_HEAD);
  });

  test("never over the cap, never half a surrogate pair", () => {
    const { log } = failingLaneLog();
    const emoji = "🐦".repeat(3000);
    const inputs = [
      log,
      noisyFailingLaneLog(40),
      chattyFailingLaneLog(40),
      `\u001b[31m${"🐦".repeat(2100)}\u001b[0m\n${log}`,
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

  test("an emoji error line cut by the end of the error-line scan is never kept on half a surrogate pair", () => {
    // Error lines are scanned up to where the kept end of the log starts.
    // Sweeping the noise after an emoji `error:` line moves that point across
    // the line, so some inputs put it between a high and a low surrogate.
    // 3946 is the cap runTask passes (4000 minus its "Verification failed" head).
    const laneLog = (after: number) =>
      "  ▶️ Running task: lint\n" +
      "lint ok\n".repeat(50) +
      "  ▶️ Running task: test\n" +
      "console noise\n".repeat(200) +
      "(fail) greets user\n" +
      `error: expected "${"👋".repeat(20)}" got "hi"\n` +
      "console noise\n".repeat(after) +
      `${LANE_FAILED_LINE}\n`;
    for (let after = 100; after <= 160; after++) {
      for (const max of [3946, VERIFY_FEEDBACK_MAX_CHARS]) {
        const out = verifyFeedbackExcerpt(laneLog(after), max);
        expect(out.length).toBeLessThanOrEqual(max);
        expect(out).toContain("Failing step: test (step 3 of lane 'verify')");
        expect(LONE_SURROGATE.test(out)).toBe(false);
      }
    }
  });
});

/**
 * A failing `fledge lanes run verify --non-interactive` log shaped like
 * Corvidinho's own lane (AGENT-4.a, REQ-agent-002): `lint` and `smoke` pass
 * and `smoke` prints the CLI `--help` (over 4000 chars), then `test` fails.
 * The runner joins stdout then stderr (src/agent/verify.ts), so every line
 * of the failing test comes after the `--help` text. Format as printed by
 * fledge 1.8.0 and bun test 1.4.
 */

/** First line of the `--help` text: the start of the log a head cut keeps. */
export const HELP_HEAD = "corvidinho 0.0.30 — Linux-first headless agent CLI";

/** fledge's own failure line, the last line of the log. */
export const LANE_FAILED_LINE =
  "error: Lane 'verify' failed at step 3 (test) after 121ms: Task 'test' failed with exit code 1";

function helpText(): string {
  const lines = [HELP_HEAD, "", "Usage: corvidinho <command> [options]", "", "Commands:"];
  for (let i = 0; lines.join("\n").length < 4400; i++) {
    lines.push(
      `  command-${String(i).padStart(2, "0")} [--flag <value>]   does one documented thing (see docs)`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function failingLaneLog(): { stdout: string; stderr: string; log: string } {
  const stdout =
    "▶️ Lane: verify — Required gate before claiming done\n" +
    "  ▶️ Running task: lint\n" +
    "  ✔ Step 1 done (2041ms)\n" +
    "  ▶️ Running task: smoke\n" +
    helpText() +
    "\n  ✔ Step 2 done (192ms)\n" +
    "  ▶️ Running task: test\n" +
    "bun test v1.4.2 (744846f84)\n";
  const stderr = [
    "",
    "tests/sum.test.ts:",
    '1 | import { test, expect } from "bun:test";',
    '2 | test("adds numbers", () => { expect(1 + 1).toBe(2); });',
    '3 | test("sum of three", () => { expect(1 + 2 + 3).toBe(7); });',
    "                                                   ^",
    "error: expect(received).toBe(expected)",
    "",
    "Expected: 7",
    "Received: 6",
    "",
    "      at <anonymous> (/work/tests/sum.test.ts:3:48)",
    "(fail) sum of three [0.34ms]",
    "",
    " 1 pass",
    " 1 fail",
    " 2 expect() calls",
    "Ran 2 tests across 1 file. [114.00ms]",
    LANE_FAILED_LINE,
    "",
  ].join("\n");
  return { stdout, stderr, log: `${stdout}${stderr}` };
}

/**
 * The same lane where the failing test step itself prints far more than the
 * cap: a first failure early, `noise` lines of log chatter (and passing tests
 * whose names say "fails"), then a second failure and the summary at the end.
 */
export function noisyFailingLaneLog(noise = 120): string {
  const { stdout } = failingLaneLog();
  const chatter: string[] = [];
  for (let i = 0; i < noise; i++) {
    chatter.push(`[bridge] tick ${i} ${"x".repeat(100)}`);
    chatter.push(`(pass) session store > case ${i} fails closed when the lock is held [0.10ms]`);
  }
  const stderr = [
    "",
    "tests/first.test.ts:",
    'error: expect(received).toBe(expected) FIRST-FAILURE',
    "Expected: 5",
    "Received: 4",
    "(fail) first real failure [0.23ms]",
    ...chatter,
    "",
    "tests/second.test.ts:",
    "error: expect(received).toEqual(expected) SECOND-FAILURE",
    "(fail) second real failure [0.20ms]",
    "",
    " 238 pass",
    " 2 fail",
    "Ran 240 tests across 8 files. [120.00ms]",
    LANE_FAILED_LINE,
    "",
  ].join("\n");
  return `${stdout}${stderr}`;
}

/**
 * The lane as Corvidinho's own `bun test` really fails: bun's reporter writes
 * to stderr, and the tests' console output fills stdout right after the
 * `Running task: test` marker (about 41 KB on this repo at v0.0.30, with log
 * lines that mention "failed" or "error" without being a failure). With the
 * log joined stdout then stderr, `chatter` such lines come before the real
 * failure, and more stderr (file headers, console.error) comes after it, so
 * the failure is neither the first error-ish line nor in the end of the log.
 */
export function chattyFailingLaneLog(chatter = 20): string {
  const { stdout } = failingLaneLog();
  const logLines: string[] = [];
  for (let i = 0; i < chatter; i++) {
    logLines.push(
      `[discord] restart recovery: ${i} interrupted schedule run(s) marked failed, ${i} leftover worktree(s) removed`,
    );
    logLines.push(
      `[watch] spawn outcome event=c-${i} session=wsess_${i} ok=true exit=0 error_class=ok duration_ms=0`,
    );
    logLines.push(`[bridge] tick ${i}: 0 due, 0 claimed`);
  }
  const laterFiles: string[] = [];
  for (let i = 0; i < 40; i++) {
    laterFiles.push("", `tests/discord.case-${i}.test.ts:`);
    laterFiles.push("[discord] no owner configured — nobody is ADMIN (IDENTITY-3).");
  }
  const stderr = [
    "",
    "tests/discord.slash-reply-continuity.test.ts:",
    "[discord] no owner configured — nobody is ADMIN (IDENTITY-3).",
    "",
    "tests/sum.test.ts:",
    '3 | test("sum of three", () => { expect(1 + 2 + 3).toBe(7); });',
    "                                                   ^",
    "error: expect(received).toBe(expected)",
    "",
    "Expected: 7",
    "Received: 6",
    "",
    "      at <anonymous> (/work/tests/sum.test.ts:3:48)",
    "(fail) sum of three [0.34ms]",
    ...laterFiles,
    "",
    " 1848 pass",
    " 1 fail",
    "Ran 1849 tests across 145 files. [165.07s]",
    LANE_FAILED_LINE,
    "",
  ].join("\n");
  return `${stdout}${logLines.join("\n")}\n${stderr}`;
}

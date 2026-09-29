/**
 * Default verify runner: fledge lanes run verify --non-interactive (FLEDGE-2/3),
 * and the excerpt of its output a retry sends the model (AGENT-4.a).
 */

import { isWorkerEnvDropped } from "../autonomous/delegate.ts";
import {
  collectProcessTree,
  killProcessTree,
  trackChildProcess,
  type ProcEntry,
} from "../plugins/proc-group.ts";
import type { VerifyResult, VerifyRunner } from "./types.ts";

export const VERIFY_ARGS = [
  "lanes",
  "run",
  "verify",
  "--non-interactive",
] as const;

/**
 * LLM provider keys: a worker needs them, the verify lane does not. Also the
 * vendor keys the Fledge plugin child env drops (plugins/fledge/spawn.ts).
 */
const VERIFY_ENV_DROP = new Set([
  "CORVIDINHO_LLM_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENROUTER_API_KEY",
]);

/**
 * True when an inherited env key must not reach the verify lane (SAFE-6): the
 * delegate worker drop list (Discord config, GitHub tokens, audit key, acting
 * identity) plus LLM API keys. The lane runs tests the agent wrote.
 */
export function isVerifyEnvDropped(key: string): boolean {
  return isWorkerEnvDropped(key) || VERIFY_ENV_DROP.has(key);
}

/** The verify lane's env: `base` minus {@link isVerifyEnvDropped} keys. */
export function buildVerifyEnv(
  base: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) {
    if (typeof v === "string" && !isVerifyEnvDropped(k)) env[k] = v;
  }
  return env;
}

/**
 * After an abort, how long the runner still waits for the lane's output
 * pipes. The caller drops that output (a cancel), and a lane process that
 * escaped the tree kill (its own session, already reparented) may hold a pipe
 * open for as long as it runs.
 */
const ABORT_PIPE_GRACE_MS = 250;

export const defaultVerifyRunner: VerifyRunner = async (cwd, signal) => {
  const fledge = Bun.which("fledge");
  if (!fledge) {
    return {
      success: false,
      output: "fledge not on PATH — cannot run verify lane",
    };
  }
  if (signal?.aborted) {
    return { success: false, output: "verify lane aborted before start" };
  }
  const proc = Bun.spawn([fledge, ...VERIFY_ARGS], {
    cwd,
    env: buildVerifyEnv(),
    stdout: "pipe",
    stderr: "pipe",
    // Own process group: an abort stops the lane's tasks (tests, typecheck),
    // not only fledge, which leaves them running (AGENT-3, REQ-agent-244).
    detached: true,
  });
  // What the lane left in its group as fledge exited: an abort or this
  // process exiting still reaches it (as in spawnCapped).
  let atExit: ProcEntry[] = [];
  const exited = proc.exited.then((code) => {
    atExit = collectProcessTree(proc.pid, { rootJustExited: true });
    return code;
  });
  const untrack = trackChildProcess(proc.pid, () => atExit);
  // An abort stops waiting on the output pipes after a short grace (AGENT-3).
  let giveUp: () => void = () => {};
  const gaveUp = new Promise<null>((resolve) => {
    giveUp = () => resolve(null);
  });
  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  const onAbort = () => {
    killProcessTree(proc.pid, { known: atExit });
    graceTimer ??= setTimeout(giveUp, ABORT_PIPE_GRACE_MS);
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const code = await exited;
    const read = Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const out = await Promise.race([read, gaveUp]);
    if (out === null) {
      return { success: false, output: "verify lane aborted" };
    }
    const [stdout, stderr] = out;
    return { success: code === 0, output: `${stdout}${stderr}` };
  } finally {
    if (graceTimer) clearTimeout(graceTimer);
    signal?.removeEventListener("abort", onAbort);
    untrack();
  }
};

/**
 * Most verify lane output a retry sends the model (AGENT-4.a, REQ-agent-002).
 * The tool loop and the read-tier chat both cap the feedback here.
 */
export const VERIFY_FEEDBACK_MAX_CHARS = 4000;

/**
 * fledge's own failure line: `Lane 'verify' failed at step 3 (test) after …`,
 * or `… failed at step 1 (parallel(lint, smoke)) after …` for a parallel step.
 */
const LANE_FAILED_RE =
  /Lane '([^'\n]*)' failed at step (\d+) \(((?:[^()\n]|\([^()\n]*\))*)\)/g;
/**
 * fledge's step markers on stdout: `  ▶️ Running task: test`, and
 * `  ▶️ Running parallel: lint, smoke` before a parallel step's tasks.
 */
const RUNNING_STEP_RE = /^[^\n]*Running (task|parallel): ([^\n]*?)[ \t]*$/gm;
/**
 * Colour escapes (CSI), as a lane prints them when FORCE_COLOR or
 * CLICOLOR_FORCE reaches it: noise to the model, and they hide the markers.
 */
const ANSI_CSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
/** Lines kept from the failing step when its output is over the cap. */
const ERROR_LINE_RE =
  /error|fail|panic|fatal|exception|\bexpected\b|\breceived\b|[✗✘✖]/i;
/**
 * Error lines that report a failure (a test runner's `(fail)`, `error:`,
 * `Expected:` / `Received:` lines, a `TypeError: …`, a compiler's
 * `file(1,2): error TS…`, a `✗` check) rather than a log line that mentions
 * one (`… marked failed`, `error_class=ok`). They are kept first, so a step's
 * console chatter cannot crowd its failure out.
 */
const FAILURE_LINE_RE =
  /^\s*(?:\(fail\)|[✗✘✖]|\w*(?:error|exception)\b|(?:fail(?:ed|ure)?|panic|fatal|expected|received)\b)|:\s*(?:error|fatal)\b/i;
/** Passing tests and steps, even when a test name says "fails". */
const PASS_LINE_RE = /^\s*(?:\(pass\)|\(skip\)|\(todo\)|✓|✔)/;
const ERROR_LINE_MAX_CHARS = 300;
/** A tail cut mid-line moves to the next line start when one is this close. */
const TAIL_LINE_SNAP_CHARS = 200;

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/** At most `n` chars from the end, from a line start when one is near. */
function tailOf(text: string, n: number): string {
  if (n <= 0) return "";
  if (text.length <= n) return text;
  let start = text.length - n;
  if (text[start - 1] !== "\n") {
    const nl = text.indexOf("\n", start);
    if (nl !== -1 && nl - start < TAIL_LINE_SNAP_CHARS && nl + 1 < text.length) {
      start = nl + 1;
    }
  }
  // Never start on half a surrogate pair.
  if (isLowSurrogate(text.charCodeAt(start))) start += 1;
  return text.slice(start);
}

/** One kept error line, at most ERROR_LINE_MAX_CHARS. */
function capLine(line: string): string {
  if (line.length <= ERROR_LINE_MAX_CHARS) return line;
  let cut = ERROR_LINE_MAX_CHARS - 1;
  if (isHighSurrogate(line.charCodeAt(cut - 1))) cut -= 1;
  return `${line.slice(0, cut)}…`;
}

/**
 * The verify lane output a retry sends the model (AGENT-4.a, REQ-agent-002).
 * Output within `max` chars is returned unchanged. Over it, colour escapes
 * are dropped, the start of the log (earlier steps that passed, such as a
 * typecheck or a `--help` smoke) is left out and the failing step is kept:
 * its name from fledge's `Lane '…' failed at step N (name)` line, its output
 * from its `Running task: <name>` marker on when that fits, else the error /
 * fail lines of that output (lines that report a failure before lines that
 * only mention one) and the end of the log. Never longer than `max`; never
 * cut inside a surrogate pair.
 */
export function verifyFeedbackExcerpt(
  output: string,
  max: number = VERIFY_FEEDBACK_MAX_CHARS,
): string {
  if (output.length <= max) return output;
  const log = output.replace(ANSI_CSI_RE, "");
  if (log.length <= max) return log;

  let lane: { name: string; step: string; task: string } | undefined;
  for (const m of log.matchAll(LANE_FAILED_RE)) {
    lane = { name: m[1] ?? "", step: m[2] ?? "", task: m[3] ?? "" };
  }
  // The failing step's output starts at its (last) marker; a parallel step
  // starts at its `Running parallel:` line. A lane runs its steps in order,
  // so without a named match the last marker is the step that failed. The
  // log is stdout then stderr, so stderr is in the section.
  let lastNamed: number | undefined;
  let lastAny: number | undefined;
  for (const m of log.matchAll(RUNNING_STEP_RE)) {
    const name = m[1] === "parallel" ? `parallel(${m[2] ?? ""})` : (m[2] ?? "");
    if (m[1] === "task") lastAny = m.index;
    if (lane && name === lane.task) lastNamed = m.index;
  }
  const sectionStart = lastNamed ?? lastAny ?? 0;
  const section = log.slice(sectionStart);

  let fixed =
    lane || lastAny !== undefined
      ? `[verify output is ${log.length} chars, over the feedback cap: ` +
        `this is the failing step's output, not the start of the log]\n`
      : `[verify output is ${log.length} chars, over the feedback cap: ` +
        `its start is left out]\n`;
  if (lane) {
    fixed += `Failing step: ${lane.task} (step ${lane.step} of lane '${lane.name}')\n`;
  }
  if (fixed.length >= max) return tailOf(log, max);

  const avail = max - fixed.length;
  if (section.length <= avail) return fixed + section;

  const errorsLabel = "Error lines from the failing step:\n";
  const tailLabel = "\n… end of the verify output:\n";
  const body = avail - errorsLabel.length - tailLabel.length;
  if (body <= 0) return fixed + tailOf(log, avail);
  // At least half the room is the end of the log. Error lines before it get
  // the rest: lines that report a failure first, then lines that mention
  // one, first ones first (the first error is often the cause), printed in
  // log order.
  const tailBudget = Math.ceil(body / 2);
  const room = body - tailBudget;
  let scanEnd = Math.max(sectionStart, log.length - tailBudget);
  // Never end the scanned lines on half a surrogate pair.
  if (scanEnd > sectionStart && isLowSurrogate(log.charCodeAt(scanEnd))) scanEnd -= 1;
  const seen = new Set<string>();
  const found: { at: number; line: string; failure: boolean }[] = [];
  const lines = log.slice(sectionStart, scanEnd).split("\n");
  for (let at = 0; at < lines.length; at++) {
    const line = capLine((lines[at] ?? "").trimEnd());
    if (!line.trim() || seen.has(line)) continue;
    if (!ERROR_LINE_RE.test(line) || PASS_LINE_RE.test(line)) continue;
    seen.add(line);
    found.push({ at, line, failure: FAILURE_LINE_RE.test(line) });
  }
  const kept: { at: number; line: string }[] = [];
  let used = 0;
  for (const failure of [true, false]) {
    for (const f of found) {
      if (f.failure !== failure) continue;
      if (used + f.line.length + 1 > room) break;
      kept.push(f);
      used += f.line.length + 1;
    }
  }
  if (kept.length === 0) return fixed + tailOf(log, avail);
  kept.sort((a, b) => a.at - b.at);
  const errors = `${errorsLabel}${kept.map((k) => k.line).join("\n")}\n`;
  const tail = tailOf(log, avail - errors.length - tailLabel.length);
  return `${fixed}${errors}${tailLabel}${tail}`;
}

export type { VerifyResult };

/**
 * Default verify runner: fledge lanes run verify --non-interactive (FLEDGE-2/3).
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

/** LLM provider keys: a worker needs them, the verify lane does not. */
const VERIFY_ENV_DROP = new Set(["CORVIDINHO_LLM_API_KEY", "OPENAI_API_KEY"]);

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

export type { VerifyResult };

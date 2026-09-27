/**
 * Default verify runner: fledge lanes run verify --non-interactive (FLEDGE-2/3).
 */

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

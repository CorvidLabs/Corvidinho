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
  const onAbort = () => {
    killProcessTree(proc.pid, { known: atExit });
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const code = await exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const output = `${stdout}${stderr}`;
    return { success: code === 0, output };
  } finally {
    signal?.removeEventListener("abort", onAbort);
    untrack();
  }
};

export type { VerifyResult };

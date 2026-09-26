/**
 * Default verify runner: fledge lanes run verify --non-interactive (FLEDGE-2/3).
 */

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
  const proc = Bun.spawn([fledge, ...VERIFY_ARGS], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    signal,
  });
  const code = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const output = `${stdout}${stderr}`;
  return { success: code === 0, output };
};

export type { VerifyResult };

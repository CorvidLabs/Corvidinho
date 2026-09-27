/**
 * Default verify runner: fledge lanes run verify --non-interactive (FLEDGE-2/3).
 */

import { isWorkerEnvDropped } from "../autonomous/delegate.ts";
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
    env: buildVerifyEnv(),
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

/**
 * Language runner commands (PLUGIN-4 / PLUGIN-2 / SAFE-1).
 *
 * `node-exec`, `python-exec` and `cargo-exec` run their toolchain's binary
 * with the model's argv verbatim: an argv array, never a shell string, so
 * nothing is expanded, globbed or split. The binary is the absolute path
 * resolved when the runner was registered (index.ts), so the child's PATH
 * cannot swap it.
 *
 * They run arbitrary code with the operator's privileges, so each is
 * `dangerous: true` (SAFE-1: denied non-interactively unless allowlisted,
 * audited, never offered to non-ADMIN role sessions) and `minTier: 2`
 * (code), like `shell-exec`. The spawn cwd is pinned to the plugin cwd
 * (project root / task worktree); there is no cwd option.
 *
 * The child gets the verify lane's scrubbed env (no Discord config, GitHub
 * tokens, audit key, acting identity or LLM keys; src/agent/verify.ts),
 * without CDPATH / OLDPWD, like `shell-exec`. The spawn is bounded
 * (plugins/fledge/spawn.ts): stdin closed, timeout, per-stream output cap,
 * own process group killed on timeout or the calling run's abort. A binary
 * that cannot start returns exit 127 instead of throwing.
 */

import { resolve } from "node:path";
import { buildVerifyEnv } from "../../src/agent/verify.ts";
import { scrubSecrets } from "../../src/store/scrub.ts";
import type { PluginCommand, PluginHandlerResult } from "../../src/plugins/types.ts";
import { spawnCapped } from "../fledge/spawn.ts";

/** One language runner: command name, toolchain label, binaries tried in order. */
export type RunnerSpec = {
  name: string;
  tool: string;
  candidates: readonly string[];
  example: string;
};

export const RUNNERS: readonly RunnerSpec[] = [
  { name: "node-exec", tool: "node", candidates: ["node"], example: '["-e","console.log(1)"]' },
  {
    name: "python-exec",
    tool: "python",
    candidates: ["python3", "python"],
    example: '["-c","print(1)"]',
  },
  { name: "cargo-exec", tool: "cargo", candidates: ["cargo"], example: '["test","--quiet"]' },
];

/** Long enough for a cold `cargo build`; the run's abort still stops it sooner. */
export const RUNNER_TIMEOUT_MS = 600_000;
export const RUNNER_MAX_OUTPUT_BYTES = 64 * 1024;

/** Small on purpose: it is paid for in every code-tier tool catalog (FLEDGE-5 / PLUGIN-6). */
export function runnerDescription(spec: RunnerSpec): string {
  return `Run ${spec.tool} with argv verbatim (no shell) in the project root. dangerous + minTier=code. Args: ${spec.tool}'s own argv, e.g. ${spec.example}.`;
}

/** Child env: the verify lane's scrub, no CDPATH / OLDPWD, project root hint. */
export function runnerChildEnv(
  base: NodeJS.ProcessEnv,
  projectRoot: string,
): Record<string, string> {
  const env = buildVerifyEnv(base);
  delete env.CDPATH;
  delete env.OLDPWD;
  env.CORVIDINHO_PROJECT_ROOT = projectRoot;
  return env;
}

export type RunRunnerOptions = {
  spec: RunnerSpec;
  bin: string;
  args: readonly string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxOutputBytes?: number;
  /** Calling run's abort signal (AGENT-3): stops the runner's process tree. */
  signal?: AbortSignal;
};

export async function runRunner(opts: RunRunnerOptions): Promise<PluginHandlerResult> {
  const { spec, bin } = opts;
  if (opts.args.length === 0) {
    return {
      ok: false,
      error: `usage: ${spec.name} <${spec.tool} args...> (argv only, no shell), e.g. ${spec.example}`,
      exitCode: 1,
    };
  }
  const root = resolve(opts.cwd);
  const timeoutMs = opts.timeoutMs ?? RUNNER_TIMEOUT_MS;
  const maxBytes = opts.maxOutputBytes ?? RUNNER_MAX_OUTPUT_BYTES;
  const argv = [bin, ...opts.args.map((a) => String(a))];
  const res = await spawnCapped(argv, {
    cwd: root,
    env: runnerChildEnv(opts.env ?? process.env, root),
    timeoutMs,
    maxBytes,
    signal: opts.signal,
  });
  if (res.spawnError) {
    // PLUGIN-4: a toolchain that went missing after load degrades to a clean error.
    return {
      ok: false,
      error: `${spec.name}: ${spec.tool} could not start (${bin}): ${scrubSecrets(res.spawnError)}`,
      exitCode: 127,
      data: { runner: spec.name, bin, cwd: root, exitCode: 127, started: false },
    };
  }

  // Runner output is untrusted data headed for chat/logs: scrub secrets (SAFE-6).
  let output = scrubSecrets(`${res.stdout}${res.stderr}`);
  if (res.truncated) output += `\n[output truncated at ${maxBytes} bytes per stream]\n`;
  const exitCode = res.timedOut ? 124 : res.aborted ? 130 : res.code;
  const data = {
    runner: spec.name,
    bin,
    cwd: root,
    exitCode,
    timedOut: res.timedOut,
    aborted: res.aborted,
    truncated: res.truncated,
    output,
  };
  if (res.timedOut) {
    return {
      ok: false,
      data,
      error: `${spec.name} timed out after ${timeoutMs}ms and was killed`,
      exitCode: 124,
    };
  }
  if (res.aborted) {
    return {
      ok: false,
      data,
      error: `${spec.name} stopped: the calling run was interrupted`,
      exitCode: 130,
    };
  }
  if (res.code !== 0) {
    const shown = output.length > 2000 ? `…${output.slice(output.length - 2000)}` : output;
    return {
      ok: false,
      data,
      message: output,
      error: `${spec.name} exited ${res.code}${shown.trim() ? `:\n${shown}` : ""}`,
      exitCode: res.code || 1,
    };
  }
  return { ok: true, data, message: output || "(no output)\n", exitCode: 0 };
}

/** The typed command for one runner, bound to the binary resolved at load. */
export function runnerCommand(spec: RunnerSpec, bin: string): PluginCommand {
  return {
    name: spec.name,
    description: runnerDescription(spec),
    dangerous: true,
    minTier: 2,
    handler: (ctx) =>
      runRunner({ spec, bin, args: ctx.args, cwd: ctx.cwd, signal: ctx.signal }),
  };
}

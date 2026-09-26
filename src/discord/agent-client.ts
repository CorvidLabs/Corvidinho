/**
 * Spawn corvidinho for chat with --no-verify (bridge latency).
 * Injectable for tests; no ProcessManager.
 */

import type { AgentSpawnResult } from "./types.ts";

export type AgentClient = {
  runChat(opts: {
    prompt: string;
    sessionId: string;
    resume?: boolean;
  }): Promise<AgentSpawnResult>;
};

export type SpawnAgentClientOpts = {
  bin: string;
  cwd: string;
  /** Extra env (never log secrets). */
  env?: NodeJS.ProcessEnv;
};

/**
 * Spawns: `<bin> task run --no-verify --task <prompt> --json`
 * Session continuity is tracked by the bridge; CLI may ignore resume for stub.
 */
export function createSpawnAgentClient(opts: SpawnAgentClientOpts): AgentClient {
  return {
    async runChat({ prompt, sessionId }) {
      const args = [
        opts.bin.endsWith(".ts") ? opts.bin : opts.bin,
        "task",
        "run",
        "--no-verify",
        "--task",
        prompt,
        "--json",
      ];
      // When bin is a .ts file, invoke via bun.
      const cmd = opts.bin.endsWith(".ts")
        ? ["bun", ...args]
        : args;

      const proc = Bun.spawn(cmd, {
        cwd: opts.cwd,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          ...opts.env,
          CORVIDINHO_DISCORD_SESSION_ID: sessionId,
        },
      });
      const [exitCode, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      const summary =
        stdout.trim().slice(0, 1800) ||
        stderr.trim().slice(0, 500) ||
        `(exit ${exitCode})`;
      return {
        ok: exitCode === 0,
        sessionId,
        summary,
        exitCode,
      };
    },
  };
}

/** Echo stub for fixture tests — no subprocess. */
export function createEchoAgentClient(): AgentClient {
  return {
    async runChat({ prompt, sessionId }) {
      return {
        ok: true,
        sessionId,
        summary: `echo: ${prompt.slice(0, 500)}`,
        exitCode: 0,
      };
    },
  };
}

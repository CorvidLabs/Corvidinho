/**
 * Spawn corvidinho for WATCH chat with --no-verify (ingress latency).
 * Reads the `task run --output ndjson` event stream (AGENT-8, #73).
 * Injectable for tests; no ProcessManager.
 */

import {
  collectTaskRunStream,
  type TaskProgress,
} from "../agent/events-ndjson.ts";
import { buildCorvidinhoArgv } from "../agent/spawn-argv.ts";
import type { AgentSpawnResult } from "./types.ts";

export type AgentRunChatOpts = {
  prompt: string;
  sessionId: string;
  resume?: boolean;
  /**
   * Optional live progress (state / current tool / token totals) forwarded
   * from the NDJSON stream as frames arrive (REQ-watch-073).
   */
  onStatus?: (progress: TaskProgress) => void;
};

export type AgentClient = {
  runChat(opts: AgentRunChatOpts): Promise<AgentSpawnResult>;
};

export type SpawnAgentClientOpts = {
  bin: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
};

export function createSpawnAgentClient(opts: SpawnAgentClientOpts): AgentClient {
  return {
    async runChat({ prompt, sessionId, onStatus }) {
      const cmd = buildCorvidinhoArgv(opts.bin, [
        "task",
        "run",
        "--no-verify",
        "--task",
        prompt,
        "--output",
        "ndjson",
      ]);
      const proc = Bun.spawn(cmd, {
        cwd: opts.cwd,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          ...opts.env,
          CORVIDINHO_WATCH_SESSION_ID: sessionId,
        },
      });
      const { exitCode, summary } = await collectTaskRunStream({
        stdout: proc.stdout,
        stderr: proc.stderr,
        exited: proc.exited,
        onProgress: onStatus,
      });
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

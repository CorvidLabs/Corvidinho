/**
 * Spawn corvidinho for WATCH chat with prove-before-done (AGENT-4 / FLEDGE-2 / #85).
 * Verification can't be skipped (AGENT-14); a run whose real git diff is
 * empty ends with "no changes, nothing to verify" (REQ-agent-003 / 085).
 * Reads the `task run --output ndjson` event stream (AGENT-8, #73).
 * Sets the commenter's GitHub login / numeric id and the thread's repo for
 * the memory plugins (MEMORY-8, REQ-watch-067); no Discord actor, never ADMIN
 * (REQ-watch-008). The ask a run stopped on comes back as `ask`: a stuck one
 * pings the owner on Discord (AGENT-16.a, REQ-watch-086). Injectable for
 * tests; no ProcessManager.
 */

import {
  collectTaskRunStream,
  type TaskProgress,
} from "../agent/events-ndjson.ts";
import { askFromUnknown } from "../agent/ask.ts";
import { buildCorvidinhoArgv } from "../agent/spawn-argv.ts";
import { injectionNoticeFromUnknown } from "../agent/untrusted.ts";
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
  /**
   * The commenter (MEMORY-8, REQ-watch-067): their GitHub login and numeric
   * id from the GitHub API event (never a name from the text), and the
   * thread's `owner/repo`. The memory plugins resolve them to a declared
   * person in the owner's people list at each call.
   */
  actingGithubLogin?: string;
  actingGithubId?: number | string;
  repo?: string;
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
    async runChat({ prompt, sessionId, onStatus, actingGithubLogin, actingGithubId, repo }) {
      const cmd = buildCorvidinhoArgv(opts.bin, [
        "task",
        "run",
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
          // GitHub runs have no Discord actor and are never ADMIN (REQ-watch-008).
          CORVIDINHO_ACTING_DISCORD_USER_ID: "",
          CORVIDINHO_ACTING_IS_ADMIN: "0",
          CORVIDINHO_ACTING_CONFIRM_TOKENS: "",
          // MEMORY-8: the commenter and the thread's repo, always overwritten
          // (empty when unknown), never inherited from the watcher's env.
          CORVIDINHO_ACTING_GITHUB_LOGIN: actingGithubLogin?.trim() ?? "",
          CORVIDINHO_ACTING_GITHUB_ID:
            actingGithubId === undefined || actingGithubId === null ? "" : String(actingGithubId).trim(),
          CORVIDINHO_ACTING_GITHUB_REPO: repo?.trim() ?? "",
          // No Discord conversation: files never attach, private notes never read.
          CORVIDINHO_DISCORD_REPLY_CHANNEL_ID: "",
          CORVIDINHO_DISCORD_REPLY_PARENT_CHANNEL_ID: "",
          // GitHub-triggered runs have no human at a terminal: SAFE-1 non-interactive.
          CORVIDINHO_NON_INTERACTIVE: "1",
        },
      });
      const { exitCode, summary, result } = await collectTaskRunStream({
        stdout: proc.stdout,
        stderr: proc.stderr,
        exited: proc.exited,
        onProgress: onStatus,
      });
      // SAFE-13: a tool result looked like an injection (tool + reason ids only).
      const injection = injectionNoticeFromUnknown(result?.injection);
      // AGENT-16.a: the ask the run stopped on (validated, re-normalized).
      const ask = askFromUnknown(result?.ask);
      return {
        ok: exitCode === 0,
        sessionId,
        summary,
        exitCode,
        ...(injection ? { injection } : {}),
        ...(ask ? { ask } : {}),
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

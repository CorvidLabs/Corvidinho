/**
 * Spawn corvidinho for WATCH chat with prove-before-done (AGENT-4 / FLEDGE-2 / #85).
 * Verification can't be skipped (AGENT-14); a run whose real git diff is
 * empty ends with "no changes, nothing to verify" (REQ-agent-003 / 085).
 * Reads the `task run --here --output ndjson` event stream (AGENT-8, #73;
 * --here: the run works in the watcher's cwd, never a worktree of its own,
 * REQ-cli-122).
 * Sets the commenter's GitHub login / numeric id and the thread's repo for
 * the memory plugins (MEMORY-8, REQ-watch-067); no Discord actor
 * (REQ-watch-008). IDENTITY-12.a (REQ-watch-1201): stamps the role the
 * poller resolved for the person who triggered the run — owner (the ADMIN
 * bit and `CORVIDINHO_ACTING_ROLE=owner`), team, else community (ADMIN bit
 * 0) — exactly like a Discord run, so the tool layer re-resolves it from the
 * GitHub numeric id at every call; never a `/work` task. Stamps the `watch`
 * surface, which never gets the shell, runners or Fledge runs (SAFE-3.a,
 * REQ-watch-735). The ask a run
 * stopped on comes back as `ask`: a stuck one pings the owner on Discord
 * (AGENT-16.a, REQ-watch-086). A run that failed over to another configured
 * model (AGENT-11) is an `llm.fallback` warn line in the watcher's log; its
 * summary comment carries the note. A failed run hands back the result
 * frame's plain `error` as `failureReason` and its stderr end as
 * `stderrTail`, which its comment's one-line reason is read from
 * (DISCORD-3.b on GitHub, REQ-watch-009). A run a limit I set stopped
 * comes back with its `stopReason` (AGENT-12). Injectable for tests; no
 * ProcessManager.
 */

import {
  collectTaskRunStream,
  type TaskProgress,
} from "../agent/events-ndjson.ts";
import { askFromUnknown } from "../agent/ask.ts";
import { formatModelFallbackLog, modelFallbackFromUnknown } from "../agent/providers.ts";
import { ACTING_SURFACE_ENV } from "../agent/shell-gate.ts";
import { buildCorvidinhoArgv } from "../agent/spawn-argv.ts";
import type { ModelFallback } from "../agent/types.ts";
import { stopReasonFromUnknown } from "../agent/limits.ts";
import { injectionNoticeFromUnknown } from "../agent/untrusted.ts";
import { failureReasonFromUnknown } from "../discord/failure-reason.ts";
import type { PersonRole } from "../identity/people.ts";
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
  /**
   * IDENTITY-12.a: the declared role of the person who triggered the run
   * (the poller's `watchTriggerRole`: the comment or body author matched by
   * GitHub numeric id; never the thread author of an assignment or review
   * request). Owner and team are stamped as on Discord; anything else,
   * including omitted, is community. Only caps the run: the tool layer
   * re-resolves the role from the GitHub id at every call.
   */
  actingRole?: PersonRole;
};

export type AgentClient = {
  runChat(opts: AgentRunChatOpts): Promise<AgentSpawnResult>;
};

export type SpawnAgentClientOpts = {
  bin: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  /**
   * AGENT-11: called when a run's result reports failovers. Default: one
   * `[watch] llm.fallback: …` warn line on stderr.
   */
  onModelFallback?: (hops: ModelFallback[], sessionId: string) => void;
};

/** The default `llm.fallback` warn line of a WATCH run (AGENT-11). */
export function warnWatchModelFallback(hops: ModelFallback[], sessionId: string): void {
  console.warn(`[watch] ${formatModelFallbackLog(hops)} (session ${sessionId})`);
}

export function createSpawnAgentClient(opts: SpawnAgentClientOpts): AgentClient {
  return {
    async runChat({ prompt, sessionId, onStatus, actingGithubLogin, actingGithubId, repo, actingRole }) {
      // IDENTITY-12.a: the trigger's role, stamped like a Discord run's (fail closed).
      const role: PersonRole = actingRole === "owner" || actingRole === "team" ? actingRole : "community";
      const cmd = buildCorvidinhoArgv(opts.bin, [
        "task",
        "run",
        // SESSION-WORKTREE-1.a (REQ-cli-122): the run works in the cwd given
        // here, never in a new worktree of its own.
        "--here",
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
          // GitHub runs have no Discord actor (REQ-watch-008).
          CORVIDINHO_ACTING_DISCORD_USER_ID: "",
          // IDENTITY-12.a: the trigger's role, always overwritten, never
          // inherited; the tool layer re-checks it against the GitHub id.
          CORVIDINHO_ACTING_IS_ADMIN: role === "owner" ? "1" : "0",
          CORVIDINHO_ACTING_ROLE: role,
          // A WATCH run is never a /work task.
          CORVIDINHO_ACTING_WORK_TASK: "0",
          CORVIDINHO_ACTING_CONFIRM_TOKENS: "",
          // SAFE-3.a: a WATCH run never gets the shell, runners or Fledge
          // runs; always overwritten, never inherited.
          [ACTING_SURFACE_ENV]: "watch",
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
      const { exitCode, summary, result, stderrTail } = await collectTaskRunStream({
        stdout: proc.stdout,
        stderr: proc.stderr,
        exited: proc.exited,
        onProgress: onStatus,
      });
      // SAFE-13: a tool result looked like an injection (tool + reason ids only).
      const injection = injectionNoticeFromUnknown(result?.injection);
      // AGENT-16.a: the ask the run stopped on (validated, re-normalized).
      const ask = askFromUnknown(result?.ask);
      // AGENT-11: a failover is logged for the owner (the comment has the note).
      const modelFallback = modelFallbackFromUnknown(result?.modelFallback);
      if (modelFallback) (opts.onModelFallback ?? warnWatchModelFallback)(modelFallback, sessionId);
      // AGENT-12: a limit I set stopped the run (the comment says so).
      const stopReason = stopReasonFromUnknown(result?.stopReason);
      // DISCORD-3.b on GitHub (REQ-watch-009): why a failed run failed (the
      // result frame's plain `error`, else the stderr end), for
      // `watchFailureReason` only — never the provider's reply body.
      const failed = exitCode !== 0;
      const failureReason = failed ? failureReasonFromUnknown(result?.error) : undefined;
      return {
        ok: exitCode === 0,
        sessionId,
        summary,
        exitCode,
        ...(injection ? { injection } : {}),
        ...(ask ? { ask } : {}),
        ...(stopReason ? { stopReason } : {}),
        ...(failureReason ? { failureReason } : {}),
        ...(failed && stderrTail ? { stderrTail } : {}),
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

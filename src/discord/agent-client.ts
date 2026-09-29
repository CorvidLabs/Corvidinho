/**
 * Spawn corvidinho for chat with prove-before-done (AGENT-4 / FLEDGE-2 / #85).
 * Does not pass --no-verify; an empty real diff (no tool-reported files and no
 * git working-tree change, REQ-agent-085) still skips verify in the loop.
 * Reads the `task run --output ndjson` event stream so the thinking status
 * shows real state / current tool / token counts (AGENT-8 / DISCORD-3, #73).
 * Injectable for tests; no ProcessManager.
 * The child runs in its own process group: `signal` (daemon shutdown after its
 * grace, AGENT-3) or this process exiting stops the child's whole tree.
 */

import { askFromUnknown } from "../agent/ask.ts";
import { collectTaskRunStream } from "../agent/events-ndjson.ts";
import { buildCorvidinhoArgv } from "../agent/spawn-argv.ts";
import { spendWarningFromUnknown } from "../agent/spend-notice.ts";
import { injectionNoticeFromUnknown } from "../agent/untrusted.ts";
import type { PersonRole } from "../identity/people.ts";
import { extractConfirmTokens } from "../memory/confirm.ts";
import {
  collectProcessTree,
  killProcessTree,
  trackChildProcess,
  type ProcEntry,
} from "../plugins/proc-group.ts";
export { summarizeTaskRunOutput } from "../agent/task-summary.ts";
import { DISCORD_ANSWER_MAX } from "./rich-reply.ts";
import type { AgentSpawnResult } from "./types.ts";
import type { ThinkingTokens } from "./thinking-status.ts";

export type AgentStatusUpdate = {
  tool?: string;
  tokens?: ThinkingTokens;
  message?: string;
};

export type AgentRunChatOpts = {
  prompt: string;
  /**
   * The human's own words for this run, before memory/image enrichment.
   * SAFE-4 confirm tokens are taken only from here — never from `prompt`,
   * which may carry recalled memory the model wrote. Omitted ⇒ no tokens.
   */
  humanText?: string;
  sessionId: string;
  resume?: boolean;
  /** Discord acting user for MEMORY ACL scope (MEMORY-ACL-1). */
  actingUserId?: string;
  /**
   * ADMIN re-checked at spawn time (DISCORD-7 / MEMORY-ACL-3/4).
   * Empty admin lists ⇒ false (deny-all for forget/override).
   */
  actingIsAdmin?: boolean;
  /**
   * IDENTITY-8..12: the most this run allows its actor — "team" only from
   * Discord chat, slash and button picks for a declared team member
   * (`resolveDiscordActingRole`). Omitted ⇒ owner when `actingIsAdmin`, else
   * community (schedules). The tool layer re-resolves the role from the
   * people list on every call; this stamp can only lower it.
   */
  actingRole?: PersonRole;
  /** A `/work` run: team work tools apply (IDENTITY-10). */
  workTask?: boolean;
  /**
   * Per-call working directory (SESSION-WORKTREE-1). When set, overrides the
   * client default cwd so talks/schedules do not share a mutable checkout.
   */
  cwd?: string;
  /**
   * Optional live status callback (DISCORD-3): state, current tool, and token
   * counts forwarded from the NDJSON stream as frames arrive (REQ-discord-073).
   */
  onStatus?: (update: AgentStatusUpdate) => void;
  /**
   * Stops the spawned run and its whole process tree when aborted (AGENT-3);
   * the daemon aborts runs it abandons at shutdown (REQ-cli-108).
   */
  signal?: AbortSignal;
  /**
   * The channel this conversation replies in (the thread when the talk is in
   * one). `discord-send-file` attaches only here (DISCORD-17); unset ⇒ the
   * run has no conversation channel (schedules) and the tool refuses.
   */
  replyChannelId?: string;
  /** The thread's parent channel, which the channel allowlist names (DISCORD-5). */
  replyParentChannelId?: string;
};

export type AgentClient = {
  runChat(opts: AgentRunChatOpts): Promise<AgentSpawnResult>;
};

export type SpawnAgentClientOpts = {
  bin: string;
  cwd: string;
  /** Extra env (never log secrets). */
  env?: NodeJS.ProcessEnv;
};

/**
 * Spawns: `<bin> task run --task <prompt> --output ndjson` (no --no-verify;
 * REQ-discord-085 / AGENT-4) and reads stdout line by line; the summary comes
 * from the `result` frame, uncut up to DISCORD_ANSWER_MAX (DISCORD-16; the
 * bridge splits it), with the last `usage` frame for the answer footer
 * (DISCORD-15) (fallback: summarizeTaskRunOutput).
 * Session continuity is tracked by the bridge; CLI may ignore resume for stub.
 * Always sets CORVIDINHO_ACTING_DISCORD_USER_ID (empty when no actor) and
 * CORVIDINHO_ACTING_IS_ADMIN for memory plugins (REQ-discord-021 / REQ-plugins-011),
 * CORVIDINHO_ACTING_ROLE (owner | team | community) and
 * CORVIDINHO_ACTING_WORK_TASK (1 for /work) for the role gate (IDENTITY-8..12),
 * and the conversation's reply channel for `discord-send-file`
 * (CORVIDINHO_DISCORD_REPLY_CHANNEL_ID / _PARENT_CHANNEL_ID, empty when none;
 * REQ-discord-476). The GitHub commenter keys (CORVIDINHO_ACTING_GITHUB_*,
 * MEMORY-8) are always cleared.
 */
export function createSpawnAgentClient(opts: SpawnAgentClientOpts): AgentClient {
  return {
    async runChat({
      prompt,
      humanText,
      sessionId,
      actingUserId,
      actingIsAdmin,
      actingRole,
      workTask,
      cwd,
      onStatus,
      signal,
      replyChannelId,
      replyParentChannelId,
    }) {
      if (signal?.aborted) {
        return { ok: false, sessionId, summary: "interrupted before start", exitCode: 130 };
      }
      onStatus?.({ tool: "task run", message: "Spawning agent..." });
      const cmd = buildCorvidinhoArgv(opts.bin, [
        "task",
        "run",
        "--task",
        prompt,
        "--output",
        "ndjson",
      ]);

      const proc = Bun.spawn(cmd, {
        cwd: cwd ?? opts.cwd,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          ...opts.env,
          CORVIDINHO_DISCORD_SESSION_ID: sessionId,
          // Chat/schedule runs have no human at a terminal: SAFE-1 non-interactive.
          CORVIDINHO_NON_INTERACTIVE: "1",
          // Always overwrite: never inherit an actor from the bridge env (REQ-discord-021).
          CORVIDINHO_ACTING_DISCORD_USER_ID: actingUserId ?? "",
          // SAFE-4: only confirm tokens the human typed in this message count.
          CORVIDINHO_ACTING_CONFIRM_TOKENS: extractConfirmTokens(humanText ?? "").join(","),
          // DISCORD-17: the only channel discord-send-file may attach in.
          // Always overwritten, never inherited from the bridge env.
          CORVIDINHO_DISCORD_REPLY_CHANNEL_ID: replyChannelId ?? "",
          CORVIDINHO_DISCORD_REPLY_PARENT_CHANNEL_ID: replyParentChannelId ?? "",
          // MEMORY-8: a Discord (or schedule) run never acts for a GitHub
          // commenter — always cleared, never inherited.
          CORVIDINHO_ACTING_GITHUB_LOGIN: "",
          CORVIDINHO_ACTING_GITHUB_ID: "",
          CORVIDINHO_ACTING_GITHUB_REPO: "",
          ...(actingIsAdmin
            ? { CORVIDINHO_ACTING_IS_ADMIN: "1" }
            : { CORVIDINHO_ACTING_IS_ADMIN: "0" }),
          // IDENTITY-12: the most this surface allows; always overwritten,
          // never inherited. Team only when the caller said so (fail closed).
          CORVIDINHO_ACTING_ROLE: actingIsAdmin
            ? "owner"
            : actingRole === "team"
            ? "team"
            : "community",
          CORVIDINHO_ACTING_WORK_TASK: workTask ? "1" : "0",
        },
        // Own process group, so a stop reaches its tools and workers too.
        detached: true,
      });
      // What the agent left in its group as it exited (a background process
      // still holding the output pipe): an abort or this process exiting
      // still reaches it once the agent pid is gone (as in spawnCapped).
      let atExit: ProcEntry[] = [];
      void proc.exited.then(() => {
        atExit = collectProcessTree(proc.pid, { rootJustExited: true });
      });
      const untrack = trackChildProcess(proc.pid, () => atExit);
      const onAbort = () => {
        killProcessTree(proc.pid, { known: atExit });
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      const { exitCode, summary, totalTokens, usage, result } = await collectTaskRunStream({
        stdout: proc.stdout,
        stderr: proc.stderr,
        exited: proc.exited,
        // DISCORD-16: the whole answer (up to the result frame's cap); the
        // bridge splits it into ≤2000-char messages instead of cutting at 1800.
        bodyMax: DISCORD_ANSWER_MAX,
        onProgress: (p) => {
          onStatus?.({
            tool: p.tool,
            tokens:
              p.totalTokens !== undefined
                ? { estimated: p.totalTokens }
                : undefined,
            message: p.message,
          });
        },
      }).finally(() => {
        signal?.removeEventListener("abort", onAbort);
        untrack();
      });
      // Provider-reported total when a usage frame arrived; else a rough
      // stand-in from summary length (demo stub / providers without usage).
      const finalTok =
        totalTokens ?? Math.max(1, Math.ceil(summary.length / 4));
      onStatus?.({
        tool: "task run",
        tokens: { estimated: finalTok },
        message: "Agent finished",
      });
      // AUTONOMY-1/2: a validated ask from the result frame, if any.
      const ask = askFromUnknown(result?.ask);
      // SAFE-8: the 80% warning, amounts only (validated, percent recomputed).
      const spendWarning = spendWarningFromUnknown(result?.spendWarning);
      // SAFE-13: a tool result looked like an injection (tool + reason ids only).
      const injection = injectionNoticeFromUnknown(result?.injection);
      return {
        ok: exitCode === 0,
        sessionId,
        summary,
        exitCode,
        ...(ask ? { ask } : {}),
        ...(spendWarning ? { spendWarning } : {}),
        ...(injection ? { injection } : {}),
        // DISCORD-15: provider-reported usage for the answer footer.
        ...(usage ? { usage } : {}),
        // Verify facts for the /work PR gate (REQ-discord-088).
        ...(result
          ? {
              task: {
                verified: result.verified === true,
                verifySkipped: result.verifySkipped === true,
                state: result.state,
                attempts: result.attempts,
                cancelled: result.cancelled === true,
              },
            }
          : {}),
      };
    },
  };
}

export type EchoAgentClientOpts = {
  /** Artificial delay so bridge progress ticks can fire in tests. */
  delayMs?: number;
  /** Emit tool/token updates during the delay. */
  statusUpdates?: AgentStatusUpdate[];
};

/** Echo stub for fixture tests — no subprocess. */
export function createEchoAgentClient(
  opts: EchoAgentClientOpts = {},
): AgentClient {
  return {
    async runChat({ prompt, sessionId, onStatus }) {
      const updates = opts.statusUpdates ?? [
        { tool: "echo", message: "Echoing..." },
      ];
      for (const u of updates) {
        onStatus?.(u);
      }
      if (opts.delayMs && opts.delayMs > 0) {
        await Bun.sleep(opts.delayMs);
      }
      return {
        ok: true,
        sessionId,
        summary: `echo: ${prompt.slice(0, 500)}`,
        exitCode: 0,
      };
    },
  };
}

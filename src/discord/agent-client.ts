/**
 * Spawn corvidinho for chat with --no-verify (bridge latency).
 * Injectable for tests; no ProcessManager.
 */

import { buildCorvidinhoArgv } from "../agent/spawn-argv.ts";
import { extractConfirmTokens } from "../memory/confirm.ts";
import { summarizeTaskRunOutput } from "../agent/task-summary.ts";
export { summarizeTaskRunOutput } from "../agent/task-summary.ts";
import type { AgentSpawnResult } from "./types.ts";
import type { ThinkingTokens } from "./thinking-status.ts";

export type AgentStatusUpdate = {
  tool?: string;
  tokens?: ThinkingTokens;
  message?: string;
};

export type AgentRunChatOpts = {
  prompt: string;
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
   * Per-call working directory (SESSION-WORKTREE-1). When set, overrides the
   * client default cwd so talks/schedules do not share a mutable checkout.
   */
  cwd?: string;
  /** Optional live status callback (DISCORD-3); spawn path may not emit tools yet. */
  onStatus?: (update: AgentStatusUpdate) => void;
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
 * Spawns: `<bin> task run --no-verify --task <prompt> --json`
 * Session continuity is tracked by the bridge; CLI may ignore resume for stub.
 * Always sets CORVIDINHO_ACTING_DISCORD_USER_ID (empty when no actor) and
 * CORVIDINHO_ACTING_IS_ADMIN for memory plugins (REQ-discord-021 / REQ-plugins-011).
 */
export function createSpawnAgentClient(opts: SpawnAgentClientOpts): AgentClient {
  return {
    async runChat({
      prompt,
      sessionId,
      actingUserId,
      actingIsAdmin,
      cwd,
      onStatus,
    }) {
      onStatus?.({ tool: "task run", message: "Spawning agent..." });
      const cmd = buildCorvidinhoArgv(opts.bin, [
        "task",
        "run",
        "--no-verify",
        "--task",
        prompt,
        "--json",
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
          CORVIDINHO_ACTING_CONFIRM_TOKENS: extractConfirmTokens(prompt).join(","),
          ...(actingIsAdmin
            ? { CORVIDINHO_ACTING_IS_ADMIN: "1" }
            : { CORVIDINHO_ACTING_IS_ADMIN: "0" }),
        },
      });
      const [exitCode, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      const summary = summarizeTaskRunOutput(stdout, stderr, exitCode);
      // Rough token stand-in from summary length until real usage events exist.
      const roughTok = Math.max(1, Math.ceil(summary.length / 4));
      onStatus?.({
        tool: "task run",
        tokens: { estimated: roughTok },
        message: "Agent finished",
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

/**
 * Spawn corvidinho for chat with --no-verify (bridge latency).
 * Reads the `task run --output ndjson` event stream so the thinking status
 * shows real state / current tool / token counts (AGENT-8 / DISCORD-3, #73).
 * Injectable for tests; no ProcessManager.
 */

import { collectTaskRunStream } from "../agent/events-ndjson.ts";
import { buildCorvidinhoArgv } from "../agent/spawn-argv.ts";
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
  /**
   * Optional live status callback (DISCORD-3): state, current tool, and token
   * counts forwarded from the NDJSON stream as frames arrive (REQ-discord-073).
   */
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
 * Spawns: `<bin> task run --no-verify --task <prompt> --output ndjson`
 * and reads stdout line by line; the summary comes from the `result` frame
 * (fallback: summarizeTaskRunOutput).
 * Session continuity is tracked by the bridge; CLI may ignore resume for stub.
 * Passes CORVIDINHO_ACTING_DISCORD_USER_ID / CORVIDINHO_ACTING_IS_ADMIN for memory plugins.
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
          ...(actingUserId
            ? { CORVIDINHO_ACTING_DISCORD_USER_ID: actingUserId }
            : {}),
          ...(actingIsAdmin
            ? { CORVIDINHO_ACTING_IS_ADMIN: "1" }
            : { CORVIDINHO_ACTING_IS_ADMIN: "0" }),
        },
      });
      const { exitCode, summary, totalTokens } = await collectTaskRunStream({
        stdout: proc.stdout,
        stderr: proc.stderr,
        exited: proc.exited,
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

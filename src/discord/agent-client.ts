/**
 * Spawn corvidinho for chat with --no-verify (bridge latency).
 * Injectable for tests; no ProcessManager.
 */

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
 * No tool streaming yet (no ProcessManager) — bridge ticks elapsed time alone.
 */
export function createSpawnAgentClient(opts: SpawnAgentClientOpts): AgentClient {
  return {
    async runChat({ prompt, sessionId, onStatus }) {
      onStatus?.({ tool: "task run", message: "Spawning agent..." });
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

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { startBridge, memoryThinkingOutbound } from "../src/discord/bridge.ts";
import { createEchoAgentClient } from "../src/discord/agent-client.ts";
import {
  createNullGateway,
  type GatewayHandlers,
} from "../src/discord/gateway.ts";
import {
  THINKING_COLORS,
  type DiscordEmbedPayload,
} from "../src/discord/thinking-status.ts";

/** Missing allowlist file: never read the operator's allowlist (ALLOW-4). */
const NO_ALLOWLIST = join(mkdtempSync(join(tmpdir(), "corvidinho-thinking-")), "no-allowlist.toml");

describe("bridge thinking status wiring (DISCORD-3)", () => {
  test("mention path posts progress then collapses into final answer (ASK-7)", async () => {
    const box: { handlers: GatewayHandlers | null } = { handlers: null };
    const outbound = memoryThinkingOutbound();
    const replies: Array<{ content: string; messageId: string }> = [];

    const result = await startBridge({
      env: {
        DISCORD_BOT_TOKEN: "fake",
        DISCORD_CHANNEL_IDS: "chan-1",
        CORVIDINHO_DISCORD_DRY_RUN: "1",
        CORVIDINHO_ALLOWLIST_FILE: NO_ALLOWLIST,
      },
      // Temp non-git project: never create real worktrees/branches in this repo.
      projectRoot: mkdtempSync(join(tmpdir(), "corvidinho-bridge-proj-")),
      skipProtocolCheck: true,
      thinkingOutbound: outbound,
      thinkingDebounceMs: 0,
      thinkingTickMs: 60_000,
      agent: createEchoAgentClient({
        delayMs: 20,
        statusUpdates: [
          { tool: "Read", tokens: { estimated: 100 } },
          { tool: "Shell", tokens: { estimated: 250 } },
        ],
      }),
      gatewayFactory: async (_cfg, handlers) => {
        box.handlers = handlers;
        handlers.reply = async ({ content }) => {
          const messageId = `bot_${replies.length + 1}`;
          replies.push({ content, messageId });
          return { messageId };
        };
        return createNullGateway();
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok !== true) return;
    const handlers = box.handlers;
    expect(handlers).not.toBeNull();
    if (!handlers) return;

    await handlers.onMessage({
      id: "m1",
      channelId: "chan-1",
      authorId: "u1",
      authorBot: false,
      content: "@bot do a thing",
      mentionedBot: true,
    });

    expect(outbound.sends.length).toBe(1);
    expect(outbound.sends[0]!.embed).toMatchObject({
      color: THINKING_COLORS.working,
    });
    // Progress edits while working; final is content collapse (no Done+reply).
    expect(outbound.edits.length).toBeGreaterThanOrEqual(1);
    expect(replies).toHaveLength(0);
    const finalEdit = outbound.contentEdits.find(
      (e) => typeof e.content === "string" && e.content.includes("echo:"),
    );
    expect(finalEdit).toBeDefined();
    expect(finalEdit!.messageId).toBe(outbound.sends[0]!.messageId);
    expect(finalEdit!.embed).toBeNull();
    expect(result.store.bySessionId.size).toBe(1);

    await result.stop();
  });

  test("failed agent marks progress error", async () => {
    const box: { handlers: GatewayHandlers | null } = { handlers: null };
    const outbound = memoryThinkingOutbound();

    const result = await startBridge({
      env: {
        DISCORD_BOT_TOKEN: "fake",
        DISCORD_CHANNEL_IDS: "chan-1",
        CORVIDINHO_DISCORD_DRY_RUN: "1",
        CORVIDINHO_ALLOWLIST_FILE: NO_ALLOWLIST,
      },
      // Temp non-git project: never create real worktrees/branches in this repo.
      projectRoot: mkdtempSync(join(tmpdir(), "corvidinho-bridge-proj-")),
      skipProtocolCheck: true,
      thinkingOutbound: outbound,
      thinkingDebounceMs: 0,
      thinkingTickMs: 60_000,
      agent: {
        async runChat() {
          return {
            ok: false,
            sessionId: "x",
            summary: "boom",
            exitCode: 7,
          };
        },
      },
      gatewayFactory: async (_cfg, handlers) => {
        box.handlers = handlers;
        handlers.reply = async ({ content }) => ({
          messageId: `bot_${content.slice(0, 8)}`,
        });
        return createNullGateway();
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok !== true) return;
    const handlers = box.handlers;
    expect(handlers).not.toBeNull();
    if (!handlers) return;

    await handlers.onMessage({
      id: "m2",
      channelId: "chan-1",
      authorId: "u1",
      authorBot: false,
      content: "@bot fail",
      mentionedBot: true,
    });

    // ASK-7 collapse: failure body edited into the progress message.
    const failEdit = outbound.contentEdits.find(
      (e) =>
        typeof e.content === "string" &&
        (e.content.includes("failed") || e.content.includes("exit")),
    );
    expect(failEdit).toBeDefined();
    expect(failEdit!.embed).toBeNull();
    await result.stop();
  });
});

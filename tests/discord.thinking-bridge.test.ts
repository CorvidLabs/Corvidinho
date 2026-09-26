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
  test("mention path posts progress then Done before final reply tracking", async () => {
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
    expect(outbound.edits.length).toBeGreaterThanOrEqual(1);
    const lastEdit = outbound.edits[outbound.edits.length - 1]!;
    const lastEmbed = lastEdit.embed as DiscordEmbedPayload;
    expect(lastEmbed.description).toContain("Done");
    expect(lastEmbed.color).toBe(THINKING_COLORS.success);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toContain("echo:");
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

    const last = outbound.edits.at(-1)!;
    const embed = last.embed as DiscordEmbedPayload;
    expect(embed.color).toBe(THINKING_COLORS.error);
    await result.stop();
  });
});

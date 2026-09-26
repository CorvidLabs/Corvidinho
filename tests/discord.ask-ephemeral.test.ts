/**
 * DISCORD-ASK + SESSION-MULTI — bridge posts Choose stub with components;
 * button pick resumes; chat while pending does not clear button asks;
 * multi-user independence.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HumanAsk } from "../src/agent/types.ts";
import type { AgentClient } from "../src/discord/agent-client.ts";
import {
  ASK_CHOICE_EXPIRED,
  openCustomId,
  parseAskCustomId,
  pickCustomId,
  toPendingAsk,
} from "../src/discord/ask-buttons.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import {
  createNullGateway,
  type ComponentInteraction,
  type GatewayHandlers,
} from "../src/discord/gateway.ts";

const OPTIONS_ASK: HumanAsk = {
  reason: "clarify",
  question: "Which DB?",
  options: [
    { id: "1", label: "Postgres" },
    { id: "2", label: "SQLite" },
  ],
};

type Reply = {
  channelId: string;
  content: string;
  replyToMessageId?: string;
  mentionUserIds?: string[];
  components?: unknown[];
};

async function bridgeWith(agent: AgentClient) {
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const outbound = memoryThinkingOutbound();
  const replies: Reply[] = [];
  const calls: Array<{ prompt: string; humanText?: string }> = [];
  const wrapped: AgentClient = {
    async runChat(opts) {
      calls.push({ prompt: opts.prompt, humanText: opts.humanText });
      return agent.runChat(opts);
    },
  };
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: "chan-1",
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_ALLOWLIST_FILE: join(
        mkdtempSync(join(tmpdir(), "corvidinho-ask-")),
        "none.toml",
      ),
    },
    projectRoot: mkdtempSync(join(tmpdir(), "corvidinho-ask-proj-")),
    agent: wrapped,
    skipProtocolCheck: true,
    disableScheduler: true,
    thinkingOutbound: outbound,
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    gatewayFactory: async (_cfg, h) => {
      box.handlers = h;
      h.reply = async (opts) => {
        replies.push(opts);
        return { messageId: `bot_${replies.length}` };
      };
      return createNullGateway();
    },
  });
  if (!result.ok || !box.handlers) throw new Error("bridge failed");
  return { result, handlers: box.handlers, replies, calls, outbound };
}

describe("ephemeral button ask bridge (DISCORD-ASK)", () => {
  test("structured options → public stub + Choose components, not MCQ body", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return {
          ok: true,
          sessionId,
          summary: "Needs your input: Which DB?",
          exitCode: 0,
          ask: OPTIONS_ASK,
          task: {
            verified: false,
            verifySkipped: true,
            state: "blocked",
          },
        };
      },
    };
    const { result, handlers, replies } = await bridgeWith(agent);
    await handlers.onMessage({
      id: "m1",
      channelId: "chan-1",
      authorId: "user-1",
      authorBot: false,
      content: "@bot pick a DB",
      mentionedBot: true,
    });
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toContain("Choose");
    expect(replies[0]!.content).not.toContain("Postgres");
    expect(replies[0]!.components).toBeDefined();
    const pending = result.store.getByBotMessage("bot_1")!.pendingAsk!;
    expect(pending.options?.map((o) => o.label)).toEqual(["Postgres", "SQLite"]);
    expect(pending.askId).toBeTruthy();
    expect(pending.stubMessageId).toBe("bot_1");
    await result.stop();
  });

  test("open → ephemeral choices; pick resumes agent; late press expires", async () => {
    let n = 0;
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        n += 1;
        if (n === 1) {
          return {
            ok: true,
            sessionId,
            summary: "Needs your input",
            exitCode: 0,
            ask: OPTIONS_ASK,
            task: { verified: false, verifySkipped: true, state: "blocked" },
          };
        }
        return {
          ok: true,
          sessionId,
          summary: "Using Postgres",
          exitCode: 0,
          task: { verified: true, verifySkipped: false, state: "done" },
        };
      },
    };
    const { result, handlers, replies, calls } = await bridgeWith(agent);
    await handlers.onMessage({
      id: "m1",
      channelId: "chan-1",
      authorId: "user-1",
      authorBot: false,
      content: "@bot pick",
      mentionedBot: true,
    });
    const pending = result.store.list()[0]!.pendingAsk!;
    const askId = pending.askId;

    const eph: Array<Record<string, unknown>> = [];
    const openIx: ComponentInteraction = {
      id: "ix-open",
      customId: openCustomId(askId),
      channelId: "chan-1",
      userId: "user-1",
      messageId: "bot_1",
      reply: async (opts) => {
        eph.push(opts as Record<string, unknown>);
      },
    };
    await handlers.onComponent!(openIx);
    expect(eph).toHaveLength(1);
    expect(eph[0]!.ephemeral).toBe(true);
    expect(String(eph[0]!.content)).toContain("Which DB?");
    expect(eph[0]!.components).toBeDefined();

    await handlers.onComponent!({
      id: "ix-pick",
      customId: pickCustomId(askId, "1"),
      channelId: "chan-1",
      userId: "user-1",
      messageId: "bot_1",
      reply: async (opts) => {
        eph.push(opts as Record<string, unknown>);
      },
    });
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[1]!.humanText).toBe("Postgres");
    expect(result.store.list()[0]!.pendingAsk ?? null).toBeNull();
    expect(replies.some((r) => r.content.includes("Using Postgres"))).toBe(true);

    // Expired press after clear still gets short message when we re-seed expired pending
    const sess = result.store.list()[0]!;
    result.store.setPendingAsk(
      sess,
      toPendingAsk(OPTIONS_ASK, { askId: "oldask", nowMs: Date.now() - 60 * 60 * 1000 }),
    );
    const expiredReplies: string[] = [];
    await handlers.onComponent!({
      id: "ix-late",
      customId: openCustomId("oldask"),
      channelId: "chan-1",
      userId: "user-1",
      reply: async (opts) => {
        expiredReplies.push(opts.content ?? "");
      },
    });
    expect(expiredReplies[0]).toBe(ASK_CHOICE_EXPIRED);
    await result.stop();
  });

  test("chat while button ask open does not clear pending (SESSION-MULTI-3)", async () => {
    let n = 0;
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        n += 1;
        if (n === 1) {
          return {
            ok: true,
            sessionId,
            summary: "need input",
            exitCode: 0,
            ask: OPTIONS_ASK,
            task: { verified: false, verifySkipped: true, state: "blocked" },
          };
        }
        return {
          ok: true,
          sessionId,
          summary: "side chat ok",
          exitCode: 0,
          task: { verified: true, verifySkipped: false, state: "done" },
        };
      },
    };
    const { result, handlers } = await bridgeWith(agent);
    await handlers.onMessage({
      id: "m1",
      channelId: "chan-1",
      authorId: "user-1",
      authorBot: false,
      content: "@bot start",
      mentionedBot: true,
    });
    const askId = result.store.list()[0]!.pendingAsk!.askId;
    await handlers.onMessage({
      id: "m2",
      channelId: "chan-1",
      authorId: "user-1",
      authorBot: false,
      content: "@bot meanwhile tell me the time",
      mentionedBot: true,
    });
    expect(result.store.list()[0]!.pendingAsk?.askId).toBe(askId);
    expect(parseAskCustomId(openCustomId(askId))?.askId).toBe(askId);
    await result.stop();
  });

  test("two users keep independent pending asks (SESSION-MULTI-1/2)", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId, actingUserId }) {
        return {
          ok: true,
          sessionId,
          summary: "need input",
          exitCode: 0,
          ask: {
            ...OPTIONS_ASK,
            question: `Which for ${actingUserId}?`,
            options: OPTIONS_ASK.options,
          },
          task: { verified: false, verifySkipped: true, state: "blocked" },
        };
      },
    };
    const { result, handlers } = await bridgeWith(agent);
    await handlers.onMessage({
      id: "m-a",
      channelId: "chan-1",
      authorId: "user-a",
      authorBot: false,
      content: "@bot a",
      mentionedBot: true,
    });
    await handlers.onMessage({
      id: "m-b",
      channelId: "chan-1",
      authorId: "user-b",
      authorBot: false,
      content: "@bot b",
      mentionedBot: true,
    });
    const sessions = result.store
      .list()
      .filter((s) => s.channelId === "chan-1");
    expect(sessions).toHaveLength(2);
    const askA = sessions.find((s) => s.userId === "user-a")!.pendingAsk!;
    const askB = sessions.find((s) => s.userId === "user-b")!.pendingAsk!;
    expect(askA.askId).not.toBe(askB.askId);
    expect(askA.question).toContain("user-a");
    expect(askB.question).toContain("user-b");
    await result.stop();
  });
});

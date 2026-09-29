/**
 * AUTONOMY-5/6 — thin ack / cancel detectors + bridge restate / cancel path.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HumanAsk } from "../src/agent/types.ts";
import type { AgentClient } from "../src/discord/agent-client.ts";
import { ASK_ANSWER_HINT, ASK_REPLY_HINT, formatAskReply } from "../src/discord/ask-ping.ts";
import { buildAnswerStubComponents, toPendingAsk } from "../src/discord/ask-buttons.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import {
  ASK_CANCELLED_ACK,
  isCancelAsk,
  isThinAck,
} from "../src/discord/thin-ack.ts";

const OWNER_ID = "111122223333444455";
const CLARIFY: HumanAsk = { reason: "clarify", question: "Postgres or SQLite?" };

describe("isThinAck / isCancelAsk (AUTONOMY-5/6)", () => {
  test("thin words and emoji-only", () => {
    for (const t of [
      "",
      "   ",
      "ok",
      "OK",
      "okay.",
      "k",
      "sure",
      "hmmm",
      "hmm",
      "yeah",
      "yep",
      "y",
      "👍",
      "😂😅",
      "👍 😂",
      "<:party:1234567890>",
    ]) {
      expect(isThinAck(t)).toBe(true);
      expect(isCancelAsk(t)).toBe(false);
    }
  });

  test("substantive answers are not thin", () => {
    for (const t of [
      "Postgres",
      "use SQLite please",
      "option 2",
      "go with the first one",
      "ok use postgres",
    ]) {
      expect(isThinAck(t)).toBe(false);
    }
  });

  test("cancel phrases", () => {
    for (const t of ["cancel", "Cancel!", "nevermind", "never mind", "forget it", "stop asking", "nm"]) {
      expect(isCancelAsk(t)).toBe(true);
      expect(isThinAck(t)).toBe(false);
    }
  });
});

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
  const calls: string[] = [];
  const wrapped: AgentClient = {
    async runChat(opts) {
      calls.push(opts.prompt);
      return agent.runChat(opts);
    },
  };
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: "chan-1",
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_ALLOWLIST_FILE: join(mkdtempSync(join(tmpdir(), "corvidinho-thin-")), "none.toml"),
      CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID,
    },
    projectRoot: mkdtempSync(join(tmpdir(), "corvidinho-thin-proj-")),
    skipProtocolCheck: true,
    disableScheduler: true,
    thinkingOutbound: outbound,
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    agent: wrapped,
    gatewayFactory: async (_cfg, handlers) => {
      box.handlers = handlers;
      handlers.reply = async (opts) => {
        replies.push(opts);
        return { messageId: `bot_${replies.length}` };
      };
      return createNullGateway();
    },
  });
  if (!result.ok || !box.handlers) throw new Error("bridge did not start");
  return { result, handlers: box.handlers, replies, calls, outbound };
}

describe("bridge thin-ack restates / cancel clears (AUTONOMY-5/6)", () => {
  test("thin ack restates pending ask and does not spawn agent as done", async () => {
    let n = 0;
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        n += 1;
        if (n === 1) {
          return {
            ok: true,
            sessionId,
            summary: "Needs your input: Postgres or SQLite?",
            exitCode: 0,
            ask: CLARIFY,
          };
        }
        return { ok: true, sessionId, summary: "SHOULD_NOT_RUN", exitCode: 0 };
      },
    };
    const { result, handlers, replies, calls, outbound } = await bridgeWith(agent);
    await handlers.onMessage({
      id: "m1",
      channelId: "chan-1",
      authorId: "user-1",
      authorBot: false,
      content: "@bot pick a DB",
      mentionedBot: true,
    });
    // Collapsed ask; the only fresh post is the requester ping (REQ-discord-215).
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toBe("<@user-1> ↑ question for you");
    const askEdit = outbound.contentEdits.find(
      (e) => typeof e.content === "string" && e.content.includes("Postgres or SQLite?"),
    );
    expect(askEdit).toBeDefined();
    const stubId = askEdit!.messageId;
    expect(result.store.getByBotMessage(stubId)!.pendingAsk).toMatchObject(CLARIFY);
    expect(calls).toHaveLength(1);

    // Thin continue via reply to bot message
    await handlers.onMessage({
      id: "m2",
      channelId: "chan-1",
      authorId: "user-1",
      authorBot: false,
      content: "ok",
      mentionedBot: false,
      referencedMessageId: stubId,
    });
    expect(replies).toHaveLength(2);
    expect(replies[1]!.content).toContain("> Postgres or SQLite?");
    // DISCORD-ASK-4.a: the restated free-text ask carries its live Answer button.
    expect(replies[1]!.content).toContain(ASK_ANSWER_HINT);
    expect(replies[1]!.content).not.toContain(ASK_REPLY_HINT);
    const restatedAsk = result.store.getByBotMessage(stubId)!.pendingAsk!;
    expect(replies[1]!.components).toEqual(buildAnswerStubComponents(restatedAsk.askId));
    expect(replies[1]!.content).toContain("<@user-1>");
    expect(replies[1]!.content).not.toContain("SHOULD_NOT_RUN");
    expect(replies[1]!.content).not.toContain("ready when you are");
    expect(result.store.getByBotMessage(stubId)!.pendingAsk).toMatchObject(CLARIFY);
    expect(calls).toHaveLength(1); // agent not re-spawned
    expect(n).toBe(1);
    await result.stop();
  });

  test("cancel clears pendingAsk with short ack", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return {
          ok: true,
          sessionId,
          summary: "Needs your input: Postgres or SQLite?",
          exitCode: 0,
          ask: CLARIFY,
        };
      },
    };
    const { result, handlers, replies, calls, outbound } = await bridgeWith(agent);
    await handlers.onMessage({
      id: "m1",
      channelId: "chan-1",
      authorId: "user-1",
      authorBot: false,
      content: "@bot pick a DB",
      mentionedBot: true,
    });
    const stubId = outbound.contentEdits.find(
      (e) => typeof e.content === "string" && e.content.includes("Postgres"),
    )!.messageId;
    await handlers.onMessage({
      id: "m2",
      channelId: "chan-1",
      authorId: "user-1",
      authorBot: false,
      content: "cancel",
      mentionedBot: false,
      referencedMessageId: stubId,
    });
    expect(replies.at(-1)!.content).toBe(ASK_CANCELLED_ACK);
    expect(result.store.getByBotMessage(stubId)!.pendingAsk ?? null).toBeNull();
    expect(calls).toHaveLength(1);
    await result.stop();
  });

  test("substantive continue clears pending and runs agent with prior question context", async () => {
    let n = 0;
    const agent: AgentClient = {
      async runChat({ sessionId, prompt }) {
        n += 1;
        if (n === 1) {
          return {
            ok: true,
            sessionId,
            summary: "Needs your input: Postgres or SQLite?",
            exitCode: 0,
            ask: CLARIFY,
          };
        }
        return { ok: true, sessionId, summary: `chose from: ${prompt.slice(0, 80)}`, exitCode: 0 };
      },
    };
    const { result, handlers, replies, calls, outbound } = await bridgeWith(agent);
    await handlers.onMessage({
      id: "m1",
      channelId: "chan-1",
      authorId: "user-1",
      authorBot: false,
      content: "@bot pick a DB",
      mentionedBot: true,
    });
    const stubId = outbound.contentEdits.find(
      (e) => typeof e.content === "string" && e.content.includes("Postgres or SQLite?"),
    )!.messageId;
    await handlers.onMessage({
      id: "m2",
      channelId: "chan-1",
      authorId: "user-1",
      authorBot: false,
      content: "Postgres",
      mentionedBot: false,
      referencedMessageId: stubId,
    });
    expect(n).toBe(2);
    expect(calls[1]).toContain("Postgres or SQLite?");
    expect(calls[1]).toContain("Human answer:");
    expect(calls[1]).toContain("Postgres");
    const answer = outbound.contentEdits.find(
      (e) => typeof e.content === "string" && e.content.includes("chose from:"),
    );
    expect(answer).toBeDefined();
    expect(result.store.list()[0]!.pendingAsk ?? null).toBeNull();
    await result.stop();
  });
});

describe("formatAskReply restates cleanly", () => {
  test("restate keeps question and requester ping", () => {
    const r = formatAskReply({
      ask: CLARIFY,
      owner: { discordId: OWNER_ID, display: "Leif" },
      requesterDiscordId: "user-1",
      replyHint: true,
    });
    expect(r.content).toContain("> Postgres or SQLite?");
    expect(r.mentionUserIds).toEqual(["user-1"]);
  });
});

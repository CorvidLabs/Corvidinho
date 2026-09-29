/**
 * AUTONOMY-1/5/6 (REQ-discord-044) on the slash path: a `/work` or
 * `/session start` run that stopped to ask keeps the ask as the session's
 * pending ask and its answer message continues the session, so a thin reply
 * restates the question, "cancel" clears it and a substantive reply resumes
 * with the question as context — like a chat ask. A SAFE-8 spend-cap stop is
 * never the pending ask. Fixtures only: fake gateway, in-memory outbound.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SPEND_CAP_SUMMARY, spendCapReachedAsk } from "../src/agent/spend-notice.ts";
import type { HumanAsk } from "../src/agent/types.ts";
import type { AgentClient, AgentRunChatOpts } from "../src/discord/agent-client.ts";
import { ASK_REPLY_HINT, COLLAPSED_PING_QUESTION } from "../src/discord/ask-ping.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import type { SlashInteraction, SlashReplyPayload } from "../src/discord/slash-types.ts";
import { ASK_CANCELLED_ACK } from "../src/discord/thin-ack.ts";

const OWNER_ID = "111122223333444455";
const REQUESTER = "222233334444555566";
const CLARIFY: HumanAsk = { reason: "clarify", question: "Postgres or SQLite?" };
const CAP_ASK: HumanAsk = spendCapReachedAsk({
  spentMicroUsd: 4_999_000,
  estimateMicroUsd: 2_600,
  capMicroUsd: 5_000_000,
});

type Reply = { channelId: string; content: string; replyToMessageId?: string; mentionUserIds?: string[] };

/** First run returns `first`; later runs answer plainly. */
function askingAgent(first: { ask: HumanAsk; summary: string }) {
  const calls: AgentRunChatOpts[] = [];
  const agent: AgentClient = {
    async runChat(input) {
      calls.push(input);
      if (calls.length === 1) {
        return {
          ok: true,
          sessionId: input.sessionId,
          summary: first.summary,
          exitCode: 0,
          ask: first.ask,
          task: { state: "blocked", verified: false, verifySkipped: true, attempts: 1, cancelled: false },
        };
      }
      return { ok: true, sessionId: input.sessionId, summary: "ANSWERED", exitCode: 0 };
    },
  };
  return { agent, calls };
}

async function bridgeWith(agent: AgentClient, opts: { editMessage?: boolean } = {}) {
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  // With editMessage (default): the slash answer is the thinking message
  // edited in place (DISCORD-ASK-7), as on the live gateway. Without it the
  // answer is the deferred interaction reply (fallback).
  const outbound = memoryThinkingOutbound();
  const replies: Reply[] = [];
  const pings: Reply[] = [];
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: "chan-1",
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_ALLOWLIST_FILE: join(mkdtempSync(join(tmpdir(), "corvidinho-slash-ask-")), "none.toml"),
      CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID,
    },
    projectRoot: mkdtempSync(join(tmpdir(), "corvidinho-slash-ask-proj-")),
    skipProtocolCheck: true,
    disableScheduler: true,
    thinkingOutbound:
      opts.editMessage === false
        ? { sendEmbed: outbound.sendEmbed, editEmbed: outbound.editEmbed }
        : outbound,
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    agent,
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
  return { result, handlers: box.handlers, outbound, replies, pings };
}

function slashInteraction(commandName: "work" | "session", options: Record<string, string>) {
  const edits: SlashReplyPayload[] = [];
  const ix: SlashInteraction = {
    id: `ix_${commandName}_${Math.random()}`,
    commandName,
    ...(commandName === "session" ? { subcommand: "start" } : {}),
    channelId: "chan-1",
    userId: REQUESTER,
    options,
    reply: async (p) => void edits.push(p),
    deferReply: async () => {},
    editReply: async (p) => void edits.push(p),
    deleteReply: async () => {},
  };
  return { ix, edits };
}

/** A plain reply (no @mention) to a bot message. */
function replyTo(ref: string, content: string, id = `m_${Math.random()}`) {
  return {
    id,
    channelId: "chan-1",
    authorId: REQUESTER,
    authorBot: false,
    content,
    mentionedBot: false,
    referencedMessageId: ref,
  };
}

/** Run the slash command; return the id of the answer message that carries `needle`. */
async function runSlash(
  bridge: Awaited<ReturnType<typeof bridgeWith>>,
  commandName: "work" | "session",
  options: Record<string, string>,
  needle: string,
): Promise<string> {
  const { ix } = slashInteraction(commandName, options);
  await bridge.handlers.onSlash!(ix);
  const answer = bridge.outbound.contentEdits.find(
    (e) => typeof e.content === "string" && e.content.includes(needle),
  );
  if (!answer) throw new Error("no collapsed slash answer");
  // REQ-discord-215: an edit does not notify its mention, so a collapsed
  // answer that asks the requester is followed by one fresh ping post. Set
  // it aside so the tests below count only the replies to the answer.
  for (let i = bridge.replies.length - 1; i >= 0; i--) {
    if (bridge.replies[i]!.content.includes(COLLAPSED_PING_QUESTION)) {
      bridge.pings.unshift(...bridge.replies.splice(i, 1));
    }
  }
  return answer.messageId;
}

describe("/work and /session start keep a run's ask as the pending ask (AUTONOMY-1/5/6, REQ-discord-044)", () => {
  test("/work with a clarify ask: task blocked (not completed), pending ask stored, answer message continues the session", async () => {
    // No listable options: the slash answer is free text, so the pending ask
    // is free text too. (Listable options get a Choose stub and a button
    // pending ask — tests/discord.slash-choose-ask.test.ts, DISCORD-ASK-1/4.)
    const { agent, calls } = askingAgent({ ask: CLARIFY, summary: "Needs your input: Postgres or SQLite?" });
    const bridge = await bridgeWith(agent);
    const answerId = await runSlash(bridge, "work", { description: "pick a DB" }, "Postgres or SQLite?");
    if (!bridge.result.ok) throw new Error("bridge did not start");
    expect(bridge.result.workStore.list()[0]!.status).toBe("blocked");
    const session = bridge.result.store.getByBotMessage(answerId);
    expect(session).toBeDefined();
    expect(session!.id).toBe(calls[0]!.sessionId);
    expect(session!.pendingAsk).toMatchObject(CLARIFY);
    expect(session!.pendingAsk!.options).toBeUndefined();
    await bridge.result.stop();
  });

  test("/work: a thin reply to the answer restates the question and does not run the agent", async () => {
    const { agent, calls } = askingAgent({ ask: CLARIFY, summary: "Needs your input: Postgres or SQLite?" });
    const bridge = await bridgeWith(agent);
    const answerId = await runSlash(bridge, "work", { description: "pick a DB" }, "Postgres or SQLite?");
    expect(bridge.pings).toHaveLength(1);
    expect(bridge.pings[0]!.content).toBe(`<@${REQUESTER}> ${COLLAPSED_PING_QUESTION}`);
    expect(bridge.pings[0]!.mentionUserIds).toEqual([REQUESTER]);
    await bridge.handlers.onMessage(replyTo(answerId, "ok"));
    expect(calls).toHaveLength(1);
    expect(bridge.replies).toHaveLength(1);
    expect(bridge.replies[0]!.content).toContain("> Postgres or SQLite?");
    expect(bridge.replies[0]!.content).toContain(`<@${REQUESTER}>`);
    expect(bridge.replies[0]!.content).toContain(ASK_REPLY_HINT);
    expect(bridge.replies[0]!.content).not.toContain("ANSWERED");
    // AUTONOMY-4: a clarify restatement pings the requester only.
    expect(bridge.replies[0]!.mentionUserIds).toEqual([REQUESTER]);
    // Still blocked on the same question; the restatement also continues it.
    expect(bridge.result.store.getByBotMessage(answerId)!.pendingAsk).toMatchObject(CLARIFY);
    expect(bridge.result.store.getByBotMessage("bot_1")!.id).toBe(calls[0]!.sessionId);
    await bridge.result.stop();
  });

  test("/work: \"cancel\" clears the pending ask with the short ack and does not run the agent", async () => {
    const { agent, calls } = askingAgent({ ask: CLARIFY, summary: "Needs your input: Postgres or SQLite?" });
    const bridge = await bridgeWith(agent);
    const answerId = await runSlash(bridge, "work", { description: "pick a DB" }, "Postgres or SQLite?");
    await bridge.handlers.onMessage(replyTo(answerId, "cancel"));
    expect(calls).toHaveLength(1);
    expect(bridge.replies.at(-1)!.content).toBe(ASK_CANCELLED_ACK);
    expect(bridge.result.store.getByBotMessage(answerId)!.pendingAsk ?? null).toBeNull();
    await bridge.result.stop();
  });

  test("/work: a substantive reply resumes the session with the question as context and clears the pending ask", async () => {
    const { agent, calls } = askingAgent({ ask: CLARIFY, summary: "Needs your input: Postgres or SQLite?" });
    const bridge = await bridgeWith(agent);
    const answerId = await runSlash(bridge, "work", { description: "pick a DB" }, "Postgres or SQLite?");
    await bridge.handlers.onMessage(replyTo(answerId, "Postgres, with a pooled client"));
    expect(calls).toHaveLength(2);
    expect(calls[1]!.sessionId).toBe(calls[0]!.sessionId);
    expect(calls[1]!.resume).toBe(true);
    expect(calls[1]!.prompt).toContain("Prior clarifying question");
    expect(calls[1]!.prompt).toContain("Postgres or SQLite?");
    expect(calls[1]!.prompt).toMatch(
      // SAFE-12: a non-owner's answer rides an untrusted-data fence.
      /Human answer:\n\[untrusted message from the acting user \(role: community\)[^\n]*\n<<<UNTRUSTED_DATA id=[0-9a-f]+ source=chat-message>>>\nPostgres, with a pooled client\n<<<END_UNTRUSTED_DATA/,
    );
    expect(bridge.result.store.getByBotMessage(answerId)!.pendingAsk ?? null).toBeNull();
    expect(
      bridge.outbound.contentEdits.some((e) => typeof e.content === "string" && e.content.includes("ANSWERED")),
    ).toBe(true);
    await bridge.result.stop();
  });

  test("/work stopped at the spend cap: blocked, no pending ask; a later \"ok\" runs the agent with no cap text", async () => {
    const { agent, calls } = askingAgent({ ask: CAP_ASK, summary: SPEND_CAP_SUMMARY });
    const bridge = await bridgeWith(agent);
    const answerId = await runSlash(bridge, "work", { description: "add storage" }, "Daily spend cap reached");
    if (!bridge.result.ok) throw new Error("bridge did not start");
    expect(bridge.result.workStore.list()[0]!.status).toBe("blocked");
    const session = bridge.result.store.getByBotMessage(answerId);
    expect(session).toBeDefined();
    expect(session!.pendingAsk ?? null).toBeNull();
    await bridge.handlers.onMessage(replyTo(answerId, "ok"));
    expect(calls).toHaveLength(2);
    expect(calls[1]!.prompt).not.toContain("Prior clarifying question");
    expect(calls[1]!.prompt).not.toContain("Daily spend cap reached");
    await bridge.result.stop();
  });

  test("/session start with a clarify ask: pending ask stored; thin reply restates, substantive reply resumes with the question", async () => {
    const { agent, calls } = askingAgent({ ask: CLARIFY, summary: "Needs your input: Postgres or SQLite?" });
    const bridge = await bridgeWith(agent);
    const answerId = await runSlash(bridge, "session", { topic: "storage" }, "Postgres or SQLite?");
    expect(bridge.result.store.getByBotMessage(answerId)!.pendingAsk).toMatchObject(CLARIFY);
    await bridge.handlers.onMessage(replyTo(answerId, "k"));
    expect(calls).toHaveLength(1);
    expect(bridge.replies[0]!.content).toContain("> Postgres or SQLite?");
    await bridge.handlers.onMessage(replyTo("bot_1", "SQLite"));
    expect(calls).toHaveLength(2);
    expect(calls[1]!.prompt).toContain("Postgres or SQLite?");
    expect(calls[1]!.prompt).toMatch(
      // SAFE-12: a non-owner's answer rides an untrusted-data fence.
      /Human answer:\n\[untrusted message from the acting user \(role: community\)[^\n]*\n<<<UNTRUSTED_DATA id=[0-9a-f]+ source=chat-message>>>\nSQLite\n<<<END_UNTRUSTED_DATA/,
    );
    expect(bridge.result.store.getByBotMessage(answerId)!.pendingAsk ?? null).toBeNull();
    await bridge.result.stop();
  });

  test("/session start with options that cannot be listed (one choice) keeps a free-text pending ask (DISCORD-ASK-4)", async () => {
    // A single option is not a short list of choices, so no Choose buttons.
    const oneOption: HumanAsk = {
      ...CLARIFY,
      options: [{ id: "pg", label: "Postgres" }],
    };
    const { agent, calls } = askingAgent({ ask: oneOption, summary: "Needs your input: Postgres or SQLite?" });
    const bridge = await bridgeWith(agent);
    const answerId = await runSlash(bridge, "session", { topic: "storage" }, "Postgres or SQLite?");
    const pending = bridge.result.store.getByBotMessage(answerId)!.pendingAsk;
    expect(pending).toMatchObject(CLARIFY);
    expect(pending!.options).toBeUndefined();
    // Free-text semantics: a substantive reply answers and clears it.
    await bridge.handlers.onMessage(replyTo(answerId, "SQLite"));
    expect(calls).toHaveLength(2);
    expect(calls[1]!.prompt).toMatch(
      // SAFE-12: a non-owner's answer rides an untrusted-data fence.
      /Human answer:\n\[untrusted message from the acting user \(role: community\)[^\n]*\n<<<UNTRUSTED_DATA id=[0-9a-f]+ source=chat-message>>>\nSQLite\n<<<END_UNTRUSTED_DATA/,
    );
    expect(bridge.result.store.getByBotMessage(answerId)!.pendingAsk ?? null).toBeNull();
    await bridge.result.stop();
  });

  test("/work stuck ask: task failed (not completed), pending kept; owner pinged once by the notice, a thin reply restates to the owner only", async () => {
    const calls: AgentRunChatOpts[] = [];
    const STUCK: HumanAsk = { reason: "stuck", question: "Verify keeps failing on the migration. How should I proceed?" };
    const agent: AgentClient = {
      async runChat(input) {
        calls.push(input);
        return {
          ok: false,
          sessionId: input.sessionId,
          summary: "verify failed after 3 attempts",
          exitCode: 1,
          ask: STUCK,
          task: { state: "failed", verified: false, verifySkipped: false, attempts: 3, cancelled: false },
        };
      },
    };
    const bridge = await bridgeWith(agent);
    const answerId = await runSlash(bridge, "work", { description: "migrate db" }, "How should I proceed?");
    if (!bridge.result.ok) throw new Error("bridge did not start");
    expect(bridge.result.workStore.list()[0]!.status).toBe("failed");
    expect(bridge.result.store.getByBotMessage(answerId)!.pendingAsk).toMatchObject(STUCK);
    // The collapsed answer pings nobody; the owner notice is the one fresh post.
    const answer = bridge.outbound.contentEdits.find(
      (e) => e.messageId === answerId && typeof e.content === "string" && e.content.includes("How should I proceed?"),
    );
    expect(answer!.content).not.toContain(`<@${OWNER_ID}>`);
    expect(bridge.replies).toHaveLength(1);
    expect(bridge.replies[0]!.content).toContain(`<@${OWNER_ID}>`);
    expect(bridge.replies[0]!.mentionUserIds).toEqual([OWNER_ID]);
    await bridge.handlers.onMessage(replyTo(answerId, "ok"));
    expect(calls).toHaveLength(1);
    expect(bridge.replies).toHaveLength(2);
    expect(bridge.replies[1]!.content).toContain("> Verify keeps failing on the migration.");
    // AUTONOMY-2/4: a stuck restatement pings the owner, never the requester.
    expect(bridge.replies[1]!.mentionUserIds).toEqual([OWNER_ID]);
    expect(bridge.replies[1]!.content).not.toContain(`<@${REQUESTER}>`);
    await bridge.result.stop();
  });

  test("another user's reply to the /work answer neither answers nor clears the requester's ask (SESSION-MULTI-1)", async () => {
    const { agent, calls } = askingAgent({ ask: CLARIFY, summary: "Needs your input: Postgres or SQLite?" });
    const bridge = await bridgeWith(agent);
    const answerId = await runSlash(bridge, "work", { description: "pick a DB" }, "Postgres or SQLite?");
    for (const content of ["ok", "cancel", "SQLite"]) {
      await bridge.handlers.onMessage({ ...replyTo(answerId, content), authorId: "333344445555666677" });
    }
    expect(calls).toHaveLength(1);
    expect(bridge.replies).toHaveLength(0);
    expect(bridge.result.store.getByBotMessage(answerId)!.pendingAsk).toMatchObject(CLARIFY);
    await bridge.result.stop();
  });

  test("/session start stopped at the spend cap keeps no pending ask", async () => {
    const { agent } = askingAgent({ ask: CAP_ASK, summary: SPEND_CAP_SUMMARY });
    const bridge = await bridgeWith(agent);
    const answerId = await runSlash(bridge, "session", { topic: "storage" }, "Daily spend cap reached");
    const session = bridge.result.store.getByBotMessage(answerId);
    expect(session).toBeDefined();
    expect(session!.pendingAsk ?? null).toBeNull();
    await bridge.result.stop();
  });

  test("a finished /work run keeps no pending ask and its answer still continues the session", async () => {
    const calls: AgentRunChatOpts[] = [];
    const agent: AgentClient = {
      async runChat(input) {
        calls.push(input);
        return { ok: true, sessionId: input.sessionId, summary: `DONE_${calls.length}`, exitCode: 0 };
      },
    };
    const bridge = await bridgeWith(agent);
    const answerId = await runSlash(bridge, "work", { description: "tidy docs" }, "DONE_1");
    if (!bridge.result.ok) throw new Error("bridge did not start");
    expect(bridge.result.workStore.list()[0]!.status).toBe("completed");
    expect(bridge.result.store.getByBotMessage(answerId)!.pendingAsk ?? null).toBeNull();
    await bridge.handlers.onMessage(replyTo(answerId, "ok"));
    expect(calls).toHaveLength(2);
    expect(calls[1]!.sessionId).toBe(calls[0]!.sessionId);
    await bridge.result.stop();
  });

  test("fallback answer (no editMessage): the pending ask is kept, so an @mention \"ok\" restates it without running the agent", async () => {
    const { agent, calls } = askingAgent({ ask: CLARIFY, summary: "Needs your input: Postgres or SQLite?" });
    const bridge = await bridgeWith(agent, { editMessage: false });
    const { ix, edits } = slashInteraction("work", { description: "pick a DB" });
    await bridge.handlers.onSlash!(ix);
    expect(edits.at(-1)!.content).toContain("(blocked)");
    if (!bridge.result.ok) throw new Error("bridge did not start");
    expect(bridge.result.store.list()[0]!.pendingAsk).toMatchObject(CLARIFY);
    await bridge.handlers.onMessage({
      id: "m_mention",
      channelId: "chan-1",
      authorId: REQUESTER,
      authorBot: false,
      content: "<@999> ok",
      mentionedBot: true,
    });
    expect(calls).toHaveLength(1);
    expect(bridge.replies.at(-1)!.content).toContain("> Postgres or SQLite?");
    expect(bridge.result.store.list()[0]!.pendingAsk).toMatchObject(CLARIFY);
    await bridge.result.stop();
  });
});

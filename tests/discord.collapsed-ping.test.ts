/**
 * AUTONOMY-2/4 + SAFE-8 with DISCORD-ASK-6/7 (REQ-discord-215): Discord does
 * not notify a mention added by a message edit, so an answer collapsed into
 * the thinking message that mentions the requester (clarify) or the owner
 * (stuck, spend cap, 80% warning) is followed by one short fresh post that
 * pings exactly those users. No extra post for a fresh (fallback) reply, and
 * no second ping for a user the slash owner notice (#160) already pinged.
 * Fixtures only: fake gateway reply, fake thinking outbound, in-memory DB.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SpendLedger, SPEND_CAP_ENV } from "../src/agent/spend.ts";
import { SPEND_CAP_SUMMARY, spendCapReachedAsk } from "../src/agent/spend-notice.ts";
import type { HumanAsk } from "../src/agent/types.ts";
import type { AgentClient } from "../src/discord/agent-client.ts";
import { pickCustomId } from "../src/discord/ask-buttons.ts";
import {
  COLLAPSED_PING_NEEDS,
  COLLAPSED_PING_QUESTION,
  formatCollapsedPing,
} from "../src/discord/ask-ping.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import type { SlashInteraction, SlashReplyPayload } from "../src/discord/slash-types.ts";
import { finishSlashWithOwnerNotice } from "../src/discord/spend-post.ts";
import { ThinkingStatus, type EditMessageOpts, type ThinkingOutbound } from "../src/discord/thinking-status.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

const OWNER_ID = "111122223333444455";
const REQUESTER_ID = "222233334444555566";
const QUESTION = `<@${REQUESTER_ID}> ↑ question for you`;
const NEEDS = `<@${OWNER_ID}> ↑ needs you`;

type Reply = {
  channelId: string;
  content: string;
  replyToMessageId?: string;
  mentionUserIds?: string[];
  components?: unknown[];
};

/** Thinking outbound: embeds only, or with a recording `editMessage` (collapse). */
function thinkingOutbound(collapse: boolean) {
  const base = memoryThinkingOutbound();
  const finals: EditMessageOpts[] = [];
  const outbound: ThinkingOutbound = {
    sendEmbed: base.sendEmbed,
    editEmbed: base.editEmbed,
    ...(collapse
      ? {
          async editMessage(opts: EditMessageOpts) {
            finals.push(opts);
            return true;
          },
        }
      : {}),
  };
  return { outbound, finals };
}

async function bridgeWith(
  agent: AgentClient,
  opts: {
    env?: Record<string, string>;
    db?: ReturnType<typeof openCorvidinhoDb>;
    collapse?: boolean;
    /** Fail the gateway reply with this 1-based call number (or every call). */
    failReply?: (n: number) => boolean;
  } = {},
) {
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const replies: Reply[] = [];
  const { outbound, finals } = thinkingOutbound(opts.collapse ?? true);
  let calls = 0;
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: "chan-1",
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_ALLOWLIST_FILE: join(mkdtempSync(join(tmpdir(), "corvidinho-cping-")), "none.toml"),
      CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID,
      ...opts.env,
    },
    db: opts.db ?? openCorvidinhoDb({ memory: true }),
    projectRoot: mkdtempSync(join(tmpdir(), "corvidinho-cping-proj-")),
    skipProtocolCheck: true,
    disableScheduler: true,
    thinkingOutbound: outbound,
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    agent,
    gatewayFactory: async (_cfg, handlers) => {
      box.handlers = handlers;
      handlers.reply = async (o) => {
        calls += 1;
        if (opts.failReply?.(calls)) return null;
        replies.push(o);
        return { messageId: `bot_${calls}` };
      };
      return createNullGateway();
    },
  });
  if (!result.ok || !box.handlers) throw new Error("bridge did not start");
  return { result, handlers: box.handlers, replies, finals };
}

function askAgent(ask: HumanAsk | (() => HumanAsk), extra: Record<string, unknown> = {}): AgentClient {
  return {
    async runChat({ sessionId }) {
      return {
        ok: true,
        sessionId,
        summary: "Needs a human",
        exitCode: 0,
        ask: typeof ask === "function" ? ask() : ask,
        task: { state: "blocked", verified: false, verifySkipped: true, attempts: 1, cancelled: false },
        ...extra,
      };
    },
  };
}

const MENTION = {
  id: "m1",
  channelId: "chan-1",
  authorId: REQUESTER_ID,
  authorBot: false,
  content: "@bot add storage",
  mentionedBot: true,
};

const CLARIFY: HumanAsk = { reason: "clarify", question: "Which database should I use for storage?" };
const STUCK: HumanAsk = { reason: "stuck", question: "Verify keeps failing — how should I proceed?" };
const CAP_ASK: HumanAsk = spendCapReachedAsk({
  spentMicroUsd: 4_999_000,
  estimateMicroUsd: 2_600,
  capMicroUsd: 5_000_000,
});

/** A shared DB whose spend outbox holds a pending 80% warning. */
function pendingWarningDb() {
  const db = openCorvidinhoDb({ memory: true });
  const ledger = new SpendLedger(db);
  ledger.reserve({ provider: "p", model: "gpt-4o-mini", estimateMicroUsd: 850_000, capMicroUsd: 1e12, now: Date.now() - 1000 });
  expect(ledger.noteWarning({ capMicroUsd: 1_000_000, now: Date.now() })).not.toBeNull();
  return db;
}

function slashInteraction(
  commandName: "work" | "session",
  options: Record<string, string>,
  userId = REQUESTER_ID,
) {
  const edits: SlashReplyPayload[] = [];
  const deleted: boolean[] = [];
  const ix: SlashInteraction = {
    id: `ix_${commandName}_${Math.random()}`,
    commandName,
    ...(commandName === "session" ? { subcommand: "start" } : {}),
    channelId: "chan-1",
    userId,
    options,
    reply: async (p) => void edits.push(p),
    deferReply: async () => {},
    editReply: async (p) => void edits.push(p),
    deleteReply: async () => {
      deleted.push(true);
    },
  };
  return { ix, edits, deleted };
}

/** Every mention in a post, and the post's allowed mentions, are exactly `ids`. */
function expectExactPing(reply: Reply, ids: string[]) {
  expect(reply.mentionUserIds).toEqual(ids);
  const mentioned = [...reply.content.matchAll(/<@!?&?(\d+)>/g)].map((m) => m[1]);
  expect(mentioned).toEqual(ids);
  expect(reply.content).not.toMatch(/@(everyone|here)|<@&/);
  expect(reply.components).toBeUndefined();
  expect(reply.content.split("\n")).toHaveLength(1);
}

describe("formatCollapsedPing", () => {
  test("requester → question pointer, owner → needs pointer, one line, ids deduped", () => {
    expect(formatCollapsedPing({ mentionUserIds: [REQUESTER_ID], questionUserIds: [REQUESTER_ID] })).toEqual({
      content: `<@${REQUESTER_ID}> ${COLLAPSED_PING_QUESTION}`,
      mentionUserIds: [REQUESTER_ID],
    });
    expect(formatCollapsedPing({ mentionUserIds: [OWNER_ID] })).toEqual({
      content: `<@${OWNER_ID}> ${COLLAPSED_PING_NEEDS}`,
      mentionUserIds: [OWNER_ID],
    });
    expect(
      formatCollapsedPing({
        mentionUserIds: [OWNER_ID, REQUESTER_ID, OWNER_ID, " "],
        questionUserIds: [REQUESTER_ID],
      }),
    ).toEqual({
      content: `${QUESTION} · ${NEEDS}`,
      mentionUserIds: [REQUESTER_ID, OWNER_ID],
    });
  });

  test("nobody left to ping (none, or all already pinged by a fresh post) → null", () => {
    expect(formatCollapsedPing({ mentionUserIds: [] })).toBeNull();
    expect(formatCollapsedPing({ mentionUserIds: undefined })).toBeNull();
    expect(formatCollapsedPing({ mentionUserIds: [OWNER_ID], alreadyPinged: [OWNER_ID] })).toBeNull();
    expect(
      formatCollapsedPing({ mentionUserIds: [REQUESTER_ID, OWNER_ID], alreadyPinged: [OWNER_ID], questionUserIds: [REQUESTER_ID] }),
    ).toEqual({ content: QUESTION, mentionUserIds: [REQUESTER_ID] });
  });
});

describe("chat and button-pick answers collapsed into the thinking message", () => {
  test("clarify (free text): one fresh requester-only ping replying to the edited answer; a reply to the ping continues the session", async () => {
    const { result, handlers, replies, finals } = await bridgeWith(askAgent(CLARIFY));
    await handlers.onMessage(MENTION);
    expect(finals).toHaveLength(1);
    expect(finals[0]!.content).toContain(`<@${REQUESTER_ID}>`);
    expect(finals[0]!.mentionUserIds).toEqual([REQUESTER_ID]);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toBe(QUESTION);
    expect(replies[0]!.channelId).toBe("chan-1");
    expect(replies[0]!.replyToMessageId).toBe(finals[0]!.messageId);
    expectExactPing(replies[0]!, [REQUESTER_ID]);
    const session = result.store.list()[0]!;
    expect(result.store.getByBotMessage("bot_1")?.id).toBe(session.id);
    await result.stop();
  });

  test("clarify with choices (Choose stub): one fresh requester-only ping", async () => {
    const ask: HumanAsk = {
      reason: "clarify",
      question: "Which DB?",
      options: [
        { id: "1", label: "Postgres" },
        { id: "2", label: "SQLite" },
      ],
    };
    const { result, handlers, replies, finals } = await bridgeWith(askAgent(ask));
    await handlers.onMessage(MENTION);
    expect(finals).toHaveLength(1);
    expect(finals[0]!.components).toBeTruthy();
    expect(result.store.list()[0]!.pendingAsk?.stubMessageId).toBe(finals[0]!.messageId);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toBe(QUESTION);
    expect(replies[0]!.replyToMessageId).toBe(finals[0]!.messageId);
    expectExactPing(replies[0]!, [REQUESTER_ID]);
    await result.stop();
  });

  test("stuck: one fresh owner-only ping (the requester is not pinged)", async () => {
    const { result, handlers, replies, finals } = await bridgeWith(askAgent(STUCK));
    await handlers.onMessage(MENTION);
    expect(finals[0]!.mentionUserIds).toEqual([OWNER_ID]);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toBe(NEEDS);
    expect(replies[0]!.replyToMessageId).toBe(finals[0]!.messageId);
    expectExactPing(replies[0]!, [OWNER_ID]);
    await result.stop();
  });

  test("clarify plus a pending 80% warning: one post pings the requester and the owner, each with its pointer", async () => {
    const { result, handlers, replies, finals } = await bridgeWith(askAgent(CLARIFY), { db: pendingWarningDb() });
    await handlers.onMessage(MENTION);
    expect(finals[0]!.content).toContain(`⚠️ <@${OWNER_ID}> Spend warning (SAFE-8)`);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toBe(`${QUESTION} · ${NEEDS}`);
    expectExactPing(replies[0]!, [REQUESTER_ID, OWNER_ID]);
    await result.stop();
  });

  test("spend cap: the first stop in an episode pings the owner once; the next (cap ping already claimed) adds no post", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ok: true, sessionId, summary: SPEND_CAP_SUMMARY, exitCode: 0, ask: CAP_ASK };
      },
    };
    const { result, handlers, replies, finals } = await bridgeWith(agent, { env: { [SPEND_CAP_ENV]: "5" } });
    await handlers.onMessage(MENTION);
    await handlers.onMessage({ ...MENTION, id: "m2" });
    expect(finals).toHaveLength(2);
    expect(finals[1]!.mentionUserIds).toEqual([]);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toBe(NEEDS);
    expectExactPing(replies[0]!, [OWNER_ID]);
    await result.stop();
  });

  test("a finished answer that mentions nobody adds no post", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ok: true, sessionId, summary: "all good", exitCode: 0 };
      },
    };
    const { result, handlers, replies, finals } = await bridgeWith(agent);
    await handlers.onMessage(MENTION);
    expect(finals).toHaveLength(1);
    expect(replies).toHaveLength(0);
    await result.stop();
  });

  test("fallback (no collapse): the answer is a fresh reply carrying the mention, so no extra post", async () => {
    const { result, handlers, replies } = await bridgeWith(askAgent(CLARIFY), { collapse: false });
    await handlers.onMessage(MENTION);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toContain("I need your input");
    expect(replies[0]!.mentionUserIds).toEqual([REQUESTER_ID]);
    await result.stop();
  });

  test("a failed ping post does not fail the turn; the collapsed answer stays", async () => {
    const { result, handlers, replies, finals } = await bridgeWith(askAgent(STUCK), { failReply: () => true });
    await handlers.onMessage(MENTION);
    expect(finals).toHaveLength(1);
    expect(replies).toHaveLength(0);
    await result.stop();
  });

  test("button pick whose run gets stuck: the stub collapses into the ask and the owner gets one fresh ping", async () => {
    let n = 0;
    const agent = askAgent(() => {
      n += 1;
      return n === 1
        ? {
            reason: "clarify",
            question: "Which DB?",
            options: [
              { id: "1", label: "Postgres" },
              { id: "2", label: "SQLite" },
            ],
          }
        : STUCK;
    });
    const { result, handlers, replies, finals } = await bridgeWith(agent);
    await handlers.onMessage(MENTION);
    expect(replies).toHaveLength(1);
    const stub = result.store.list()[0]!.pendingAsk!;
    await handlers.onComponent!({
      id: "ix-pick",
      customId: pickCustomId(stub.askId, "1"),
      channelId: "chan-1",
      userId: REQUESTER_ID,
      messageId: stub.stubMessageId!,
      reply: async () => {},
    });
    const last = finals.at(-1)!;
    expect(last.messageId).toBe(stub.stubMessageId!);
    expect(last.mentionUserIds).toEqual([OWNER_ID]);
    expect(replies).toHaveLength(2);
    expect(replies[1]!.content).toBe(NEEDS);
    expect(replies[1]!.replyToMessageId).toBe(stub.stubMessageId!);
    expectExactPing(replies[1]!, [OWNER_ID]);
    await result.stop();
  });

  test("in a thread: the ping goes to the thread and replies to the collapsed answer there", async () => {
    const { result, handlers, replies, finals } = await bridgeWith(askAgent(CLARIFY));
    await handlers.onMessage({ ...MENTION, threadId: "thread-1" });
    expect(finals).toHaveLength(1);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.channelId).toBe("thread-1");
    expect(replies[0]!.replyToMessageId).toBe(finals[0]!.messageId);
    expectExactPing(replies[0]!, [REQUESTER_ID]);
    await result.stop();
  });

  test("replying to the ping answers the clarify; a resumed run that gets stuck pings the owner once, replying to its own answer", async () => {
    let n = 0;
    const agent = askAgent(() => {
      n += 1;
      return n === 1 ? CLARIFY : STUCK;
    });
    const { result, handlers, replies, finals } = await bridgeWith(agent);
    await handlers.onMessage(MENTION);
    expect(replies).toHaveLength(1);
    const session = result.store.list()[0]!;
    expect(session.pendingAsk?.question).toBe(CLARIFY.question);
    await handlers.onMessage({
      ...MENTION,
      id: "m2",
      content: "Use SQLite",
      mentionedBot: false,
      referencedMessageId: "bot_1",
    });
    expect(n).toBe(2);
    expect(result.store.list()).toHaveLength(1);
    expect(finals).toHaveLength(2);
    expect(finals[1]!.mentionUserIds).toEqual([OWNER_ID]);
    expect(replies).toHaveLength(2);
    expect(replies[1]!.content).toBe(NEEDS);
    expect(replies[1]!.replyToMessageId).toBe(finals[1]!.messageId);
    expectExactPing(replies[1]!, [OWNER_ID]);
    await result.stop();
  });

  test("button pick answered without mentions adds no post", async () => {
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
            ask: { reason: "clarify", question: "Which DB?", options: [{ id: "1", label: "Postgres" }, { id: "2", label: "SQLite" }] },
          };
        }
        return { ok: true, sessionId, summary: "done with Postgres", exitCode: 0 };
      },
    };
    const { result, handlers, replies, finals } = await bridgeWith(agent);
    await handlers.onMessage(MENTION);
    const stub = result.store.list()[0]!.pendingAsk!;
    await handlers.onComponent!({
      id: "ix-pick",
      customId: pickCustomId(stub.askId, "1"),
      channelId: "chan-1",
      userId: REQUESTER_ID,
      messageId: stub.stubMessageId!,
      reply: async () => {},
    });
    expect(finals.at(-1)!.content).toBe("done with Postgres");
    expect(replies).toHaveLength(1);
    await result.stop();
  });
});

describe("slash answers collapsed into the thinking message (/work, /session start)", () => {
  test("/work with a clarify ask: one fresh requester-only ping after the collapsed answer; no owner notice", async () => {
    const { result, handlers, replies, finals } = await bridgeWith(askAgent(CLARIFY));
    const { ix, deleted } = slashInteraction("work", { description: "add storage" });
    await handlers.onSlash!(ix);
    expect(deleted).toHaveLength(1);
    expect(finals).toHaveLength(1);
    expect(finals[0]!.mentionUserIds).toEqual([REQUESTER_ID]);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toBe(QUESTION);
    expect(replies[0]!.channelId).toBe("chan-1");
    expect(replies[0]!.replyToMessageId).toBe(finals[0]!.messageId);
    expectExactPing(replies[0]!, [REQUESTER_ID]);
    await result.stop();
  });

  test("/session start with a clarify ask by the owner and a pending 80% warning: the #160 owner notice is the only ping", async () => {
    const { result, handlers, replies, finals } = await bridgeWith(askAgent(CLARIFY), {
      db: pendingWarningDb(),
      env: { CORVIDINHO_OWNER_DISCORD_ID: REQUESTER_ID },
    });
    await handlers.onSlash!(slashInteraction("session", { topic: "storage" }).ix);
    expect(finals).toHaveLength(1);
    expect(finals[0]!.mentionUserIds).toEqual([REQUESTER_ID]);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toContain(`⚠️ <@${REQUESTER_ID}> Spend warning (SAFE-8)`);
    expect(replies[0]!.mentionUserIds).toEqual([REQUESTER_ID]);
    await result.stop();
  });

  test("/work at the cap with a pending warning: exactly one owner post (the #160 notice), no duplicate ping", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return {
          ok: true,
          sessionId,
          summary: SPEND_CAP_SUMMARY,
          exitCode: 0,
          ask: CAP_ASK,
          task: { state: "blocked", verified: false, verifySkipped: true, attempts: 1, cancelled: false },
        };
      },
    };
    const { result, handlers, replies, finals } = await bridgeWith(agent, {
      db: pendingWarningDb(),
      env: { [SPEND_CAP_ENV]: "5" },
    });
    await handlers.onSlash!(slashInteraction("work", { description: "add storage" }).ix);
    expect(finals).toHaveLength(1);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toContain(`💸 <@${OWNER_ID}> /work`);
    expect(replies[0]!.mentionUserIds).toEqual([OWNER_ID]);
    await result.stop();
  });

  test("/work stuck, the owner notice post fails and rides the collapsed answer: the owner gets one fresh ping", async () => {
    const { result, handlers, replies, finals } = await bridgeWith(askAgent(STUCK), {
      failReply: (n) => n === 1,
    });
    await handlers.onSlash!(slashInteraction("work", { description: "add storage" }).ix);
    expect(finals).toHaveLength(2);
    expect(finals[1]!.content).toContain(`⚠️ <@${OWNER_ID}> /work`);
    expect(finals[1]!.mentionUserIds).toEqual([OWNER_ID]);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toBe(NEEDS);
    expectExactPing(replies[0]!, [OWNER_ID]);
    await result.stop();
  });

  test("a collapsed slash answer whose deferred reply cannot be resolved still gets its ping; the error is re-thrown", async () => {
    const { outbound, finals } = thinkingOutbound(true);
    const thinking = new ThinkingStatus({ outbound, channelId: "chan-1", sessionId: "s1", debounceMs: 0, tickMs: 60_000 });
    await thinking.start({ description: "Work" });
    const { ix } = slashInteraction("work", { description: "add storage" });
    ix.deleteReply = async () => {
      throw new Error("Unknown interaction");
    };
    const posts: Reply[] = [];
    const tracked: string[] = [];
    await expect(
      finishSlashWithOwnerNotice({
        thinking,
        interaction: ix,
        sessionId: "s1",
        trackBotMessage: (id) => void tracked.push(id),
        ok: true,
        body: `❓ I need your input before I can continue. <@${REQUESTER_ID}>`,
        mentionUserIds: [REQUESTER_ID],
        notice: null,
        post: async (p) => {
          posts.push(p);
          return { messageId: "ping_1" };
        },
      }),
    ).rejects.toThrow("Unknown interaction");
    expect(finals).toHaveLength(1);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.content).toBe(QUESTION);
    expect(posts[0]!.replyToMessageId).toBe(finals[0]!.messageId);
    expectExactPing(posts[0]!, [REQUESTER_ID]);
    expect(tracked).toEqual([finals[0]!.messageId, "ping_1"]);
  });

  test("slash fallback (no collapse): the deferred reply carries the answer and no ping post is added", async () => {
    const { result, handlers, replies } = await bridgeWith(askAgent(CLARIFY), { collapse: false });
    const { ix, edits } = slashInteraction("work", { description: "add storage" });
    await handlers.onSlash!(ix);
    expect(edits.at(-1)!.content).toContain(`<@${REQUESTER_ID}>`);
    expect(replies).toHaveLength(0);
    await result.stop();
  });
});

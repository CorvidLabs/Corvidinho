/**
 * SESSION-3.a / AGENT-6.a / SESSION-5 (REQ-discord-472) through `startBridge`
 * with a fake gateway (no live Discord): after a session's soft TTL, its
 * user's reply to one of its answers, or their message in its thread, starts a
 * new session that begins from the old one's summary instead of getting no
 * answer — after the channel, actor and mute gates; the conversation is kept
 * 30 days (restarts included) and then purged; a long chat is condensed at
 * about 80% of the configured window with the task and latest instruction
 * word for word.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import type { AgentClient, AgentRunChatOpts } from "../src/discord/agent-client.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import type { InboundMessage } from "../src/discord/types.ts";
import {
  CONVERSATION_RETENTION_MS,
  condenseBudgetChars,
  SUMMARY_LABEL,
} from "../src/store/conversation.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

const CHAN = "chan-1";
const THREAD = "thread-7";
const OWNER = "100000000000000001";
const MEMBER = "100000000000000002";
const OTHER = "100000000000000003";
const TTL_MS = 45 * 60 * 1000;

/** Missing allowlist file: never read the operator's allowlist (ALLOW-4). */
const NO_ALLOWLIST = join(mkdtempSync(join(tmpdir(), "corvidinho-resume-")), "none.toml");

const running: Array<{ stop: () => Promise<void> }> = [];
const cleanups: Array<() => void> = [];
afterEach(async () => {
  for (const r of running.splice(0)) await r.stop();
  for (const c of cleanups.splice(0)) c();
});

type Call = Pick<AgentRunChatOpts, "prompt" | "humanText" | "sessionId" | "resume" | "actingUserId">;

type Clock = { now: number };

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function bridgeWith(
  reply: (n: number) => string,
  opts: { db: Database; clock: Clock; projectRoot: string; env?: Record<string, string> },
) {
  const calls: Call[] = [];
  const agent: AgentClient = {
    async runChat(o) {
      calls.push({
        prompt: o.prompt,
        humanText: o.humanText,
        sessionId: o.sessionId,
        resume: o.resume,
        actingUserId: o.actingUserId,
      });
      return { ok: true, sessionId: o.sessionId, summary: reply(calls.length), exitCode: 0 };
    },
  };
  const sessionStore = new SessionStore({
    db: opts.db,
    ttlMs: TTL_MS,
    now: () => opts.clock.now,
    defaultProjectRoot: opts.projectRoot,
    ...(opts.env?.CORVIDINHO_LLM_CONTEXT_TOKENS
      ? { contextWindowTokens: Number(opts.env.CORVIDINHO_LLM_CONTEXT_TOKENS) }
      : {}),
  });
  const outbound = memoryThinkingOutbound();
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: CHAN,
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_ALLOWLIST_FILE: NO_ALLOWLIST,
      CORVIDINHO_OWNER_DISCORD_ID: OWNER,
      ...(opts.env ?? {}),
    },
    projectRoot: opts.projectRoot,
    skipProtocolCheck: true,
    disableScheduler: true,
    thinkingOutbound: outbound,
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    agent,
    db: opts.db,
    sessionStore,
    gatewayFactory: async (_cfg, handlers) => {
      box.handlers = handlers;
      let n = 0;
      handlers.reply = async () => {
        n += 1;
        return { messageId: `bot-reply-${n}` };
      };
      return createNullGateway();
    },
  });
  if (result.ok !== true || !box.handlers) throw new Error("bridge did not start");
  running.push(result);
  return { result, handlers: box.handlers, calls, outbound, store: sessionStore };
}

function answerId(outbound: ReturnType<typeof memoryThinkingOutbound>, i: number): string {
  const send = outbound.sends[i];
  if (!send) throw new Error(`no progress message #${i}`);
  return send.messageId;
}

function mention(id: string, authorId: string, content: string, threadId?: string): InboundMessage {
  return {
    id,
    channelId: CHAN,
    ...(threadId ? { threadId } : {}),
    authorId,
    authorBot: false,
    content,
    mentionedBot: true,
  };
}

function plain(id: string, authorId: string, content: string, threadId?: string): InboundMessage {
  return { ...mention(id, authorId, content, threadId), mentionedBot: false };
}

function replyTo(id: string, authorId: string, content: string, ref: string): InboundMessage {
  return { ...plain(id, authorId, content), referencedMessageId: ref };
}

function call(calls: Call[], i: number): Call {
  const c = calls[i];
  if (!c) throw new Error(`no agent call #${i}`);
  return c;
}

const OPENING = "the codeword is PELICAN, keep it for this task";
const ANSWER_1 = "Noted: I will keep the codeword for this task.";

function setup(prefix = "corvidinho-resume-") {
  const clock: Clock = { now: 1_000_000 };
  const db = openCorvidinhoDb({ memory: true });
  cleanups.push(() => db.close());
  const projectRoot = tempDir(`${prefix}proj-`);
  return { clock, db, projectRoot };
}

describe("after the soft TTL a reply or a thread message resumes from the summary (SESSION-3.a)", () => {
  test("a reply to the expired session's answer starts a new session that begins from its conversation", async () => {
    const { clock, db, projectRoot } = setup();
    const { handlers, calls, outbound } = await bridgeWith(
      (n) => (n === 1 ? ANSWER_1 : "It was PELICAN."),
      { db, clock, projectRoot },
    );
    await handlers.onMessage(mention("m1", OWNER, OPENING));
    const answer = answerId(outbound, 0);
    clock.now += TTL_MS + 5_000;

    await handlers.onMessage(replyTo("m2", OWNER, "what was the codeword?", answer));
    expect(calls).toHaveLength(2);
    const resumed = call(calls, 1);
    expect(resumed.sessionId).not.toBe(call(calls, 0).sessionId);
    expect(resumed).toMatchObject({ resume: false, humanText: "what was the codeword?", actingUserId: OWNER });
    expect(resumed.prompt).toContain(OPENING);
    expect(resumed.prompt).toContain(ANSWER_1);
    const p = resumed.prompt;
    expect(p.indexOf(OPENING)).toBeLessThan(p.indexOf(ANSWER_1));
    expect(p.indexOf(ANSWER_1)).toBeLessThan(p.lastIndexOf("what was the codeword?"));

    // The resumed session is the conversation's live session now: a reply to
    // the old answer continues it rather than starting a third.
    await handlers.onMessage(replyTo("m3", OWNER, "and again?", answer));
    expect(call(calls, 2)).toMatchObject({ sessionId: resumed.sessionId, resume: true });
    expect(call(calls, 2).prompt).toContain("It was PELICAN.");
  });

  test("a message in its thread after the TTL starts a new session from it, without a mention", async () => {
    const { clock, db, projectRoot } = setup();
    const { handlers, calls } = await bridgeWith((n) => (n === 1 ? ANSWER_1 : "PELICAN"), {
      db,
      clock,
      projectRoot,
    });
    await handlers.onMessage(mention("m1", OWNER, OPENING, THREAD));
    clock.now += TTL_MS + 5_000;
    await handlers.onMessage(plain("m2", OWNER, "what was the codeword?", THREAD));
    expect(calls).toHaveLength(2);
    expect(call(calls, 1).sessionId).not.toBe(call(calls, 0).sessionId);
    expect(call(calls, 1).prompt).toContain(OPENING);
    expect(call(calls, 1).prompt).toContain(ANSWER_1);
  });

  test("the resumed conversation carries its condensed summary (SESSION-6)", async () => {
    const { clock, db, projectRoot } = setup();
    const { handlers, calls, outbound, store } = await bridgeWith((n) => `answer number ${n} ${"z".repeat(600)}`, {
      db,
      clock,
      projectRoot,
      env: { CORVIDINHO_LLM_CONTEXT_TOKENS: "1024" },
    });
    await handlers.onMessage(mention("m1", OWNER, OPENING));
    for (let i = 2; i <= 6; i += 1) {
      await handlers.onMessage(
        replyTo(`m${i}`, OWNER, `request number ${i} ${"q".repeat(400)}`, answerId(outbound, i - 2)),
      );
    }
    const live = store.get(call(calls, 5).sessionId)!;
    const summary = store.summaryFor(live);
    expect(summary).toContain("- You (Corvidinho): answer number 1");
    const lastAnswer = answerId(outbound, 5);
    clock.now += TTL_MS + 5_000;
    await handlers.onMessage(replyTo("m9", OWNER, "where were we?", lastAnswer));
    const p = call(calls, 6).prompt;
    expect(p).toContain(SUMMARY_LABEL);
    expect(p).toContain("- You (Corvidinho): answer number 1");
    expect(p).toContain(OPENING);
  });

  test("another user's reply to my expired answer never gets my conversation", async () => {
    const { clock, db, projectRoot } = setup();
    const { handlers, calls, outbound } = await bridgeWith((n) => `answer number ${n}`, {
      db,
      clock,
      projectRoot,
    });
    await handlers.onMessage(mention("m1", OWNER, OPENING));
    const mine = answerId(outbound, 0);
    clock.now += TTL_MS + 5_000;
    // No mention: not theirs to resume, so no answer (as before).
    await handlers.onMessage(replyTo("m2", OTHER, "what was the codeword?", mine));
    expect(calls).toHaveLength(1);
    // With a mention: their own fresh session, without my words.
    await handlers.onMessage({ ...replyTo("m3", OTHER, "what was the codeword?", mine), mentionedBot: true });
    expect(calls).toHaveLength(2);
    expect(call(calls, 1).actingUserId).toBe(OTHER);
    expect(call(calls, 1).prompt).not.toContain("PELICAN");
    expect(call(calls, 1).prompt).not.toContain("answer number 1");
    // Nor does someone else's message in my thread.
    await handlers.onMessage(mention("m4", OWNER, OPENING, THREAD));
    clock.now += TTL_MS + 5_000;
    await handlers.onMessage(plain("m5", OTHER, "what was it?", THREAD));
    expect(calls).toHaveLength(3);
  });

  test("the channel, actor (deny list) and mute gates still come first", async () => {
    const { clock, db, projectRoot } = setup();
    const { handlers, calls, outbound, result } = await bridgeWith(() => ANSWER_1, {
      db,
      clock,
      projectRoot,
    });
    await handlers.onMessage(mention("m1", MEMBER, OPENING));
    const answer = answerId(outbound, 0);
    await handlers.onMessage(mention("m2", MEMBER, OPENING, THREAD));
    clock.now += TTL_MS + 5_000;
    if (result.ok !== true) throw new Error("bridge");
    result.muteUser(MEMBER);
    await handlers.onMessage(replyTo("m3", MEMBER, "what was the codeword?", answer));
    await handlers.onMessage(plain("m4", MEMBER, "what was it?", THREAD));
    expect(calls).toHaveLength(2);
    result.unmuteUser(MEMBER);
    // Deny-listed (the live allowlist, as /admin edits it): silent, no run.
    result.config.allowlist.discord.denyUsers.push(MEMBER);
    await handlers.onMessage(replyTo("m3b", MEMBER, "what was the codeword?", answer));
    await handlers.onMessage(plain("m4b", MEMBER, "what was it?", THREAD));
    expect(calls).toHaveLength(2);
    result.config.allowlist.discord.denyUsers.pop();
    // A reply from a channel that is not allowlisted: silent, no run.
    await handlers.onMessage({ ...replyTo("m5", MEMBER, "hello?", answer), channelId: "elsewhere" });
    expect(calls).toHaveLength(2);
    await handlers.onMessage(replyTo("m6", MEMBER, "what was the codeword?", answer));
    expect(calls).toHaveLength(3);
    expect(call(calls, 2).prompt).toContain(OPENING);
  });

  test("a restart does not lose it: a session that idled out while the bridge was down resumes by reply", async () => {
    const dir = tempDir("corvidinho-resume-db-");
    const path = join(dir, "corvidinho.db");
    const projectRoot = tempDir("corvidinho-resume-proj-");
    const clock: Clock = { now: 1_000_000 };
    const db1 = openCorvidinhoDb({ path });
    const one = await bridgeWith(() => ANSWER_1, { db: db1, clock, projectRoot });
    await one.handlers.onMessage(mention("m1", OWNER, OPENING));
    const answer = answerId(one.outbound, 0);
    await one.result.stop();
    running.splice(running.indexOf(one.result), 1);
    db1.close();

    clock.now += TTL_MS + 5_000;
    const db2 = openCorvidinhoDb({ path });
    cleanups.push(() => db2.close());
    const two = await bridgeWith(() => "PELICAN", { db: db2, clock, projectRoot });
    await two.handlers.onMessage(replyTo("m2", OWNER, "what was the codeword?", answer));
    expect(two.calls).toHaveLength(1);
    expect(call(two.calls, 0).prompt).toContain(OPENING);
    expect(call(two.calls, 0).prompt).toContain(ANSWER_1);
  });

  test("after 30 days it is purged: the reply gets no answer and the conversation is gone (AGENT-6.a)", async () => {
    const { clock, db, projectRoot } = setup();
    const { handlers, calls, outbound, store } = await bridgeWith(() => ANSWER_1, {
      db,
      clock,
      projectRoot,
    });
    await handlers.onMessage(mention("m1", OWNER, OPENING));
    const answer = answerId(outbound, 0);
    clock.now += TTL_MS + 5_000;
    expect(store.list()).toEqual([]);
    clock.now += CONVERSATION_RETENTION_MS + 1;
    expect(store.purgeExpiredConversations()).toBe(1);
    await handlers.onMessage(replyTo("m2", OWNER, "what was the codeword?", answer));
    expect(calls).toHaveLength(1);
    const n = (db.query("SELECT COUNT(*) AS n FROM conversation_threads").get() as { n: number }).n;
    expect(n).toBe(0);
  });

  test("forgetting the person deletes it: a later reply gets no answer (MEMORY-ACL-6)", async () => {
    const { clock, db, projectRoot } = setup();
    const { handlers, calls, outbound, store } = await bridgeWith(() => ANSWER_1, {
      db,
      clock,
      projectRoot,
    });
    await handlers.onMessage(mention("m1", MEMBER, OPENING));
    const answer = answerId(outbound, 0);
    clock.now += TTL_MS + 5_000;
    expect(store.forgetConversations(MEMBER)).toBe(1);
    await handlers.onMessage(replyTo("m2", MEMBER, "what was the codeword?", answer));
    expect(calls).toHaveLength(1);
  });
});

describe("a long chat is condensed at about 80% of the window (SESSION-5)", () => {
  test("CORVIDINHO_LLM_CONTEXT_TOKENS sets the window; the task and latest instruction stay word for word", async () => {
    const clock: Clock = { now: 1_000_000 };
    const db = openCorvidinhoDb({ memory: true });
    cleanups.push(() => db.close());
    const projectRoot = tempDir("corvidinho-resume-proj-");
    // No injected store: the bridge reads the window from its env.
    const calls: Call[] = [];
    const agent: AgentClient = {
      async runChat(o) {
        calls.push({ prompt: o.prompt, humanText: o.humanText, sessionId: o.sessionId, resume: o.resume });
        return { ok: true, sessionId: o.sessionId, summary: `answer ${calls.length} ${"a".repeat(700)}`, exitCode: 0 };
      },
    };
    const outbound = memoryThinkingOutbound();
    const box: { handlers: GatewayHandlers | null } = { handlers: null };
    const result = await startBridge({
      env: {
        DISCORD_BOT_TOKEN: "fake",
        DISCORD_CHANNEL_IDS: CHAN,
        CORVIDINHO_DISCORD_DRY_RUN: "1",
        CORVIDINHO_ALLOWLIST_FILE: NO_ALLOWLIST,
        CORVIDINHO_OWNER_DISCORD_ID: OWNER,
        CORVIDINHO_LLM_CONTEXT_TOKENS: "2048",
      },
      projectRoot,
      skipProtocolCheck: true,
      disableScheduler: true,
      thinkingOutbound: outbound,
      thinkingDebounceMs: 0,
      thinkingTickMs: 60_000,
      agent,
      db,
      gatewayFactory: async (_cfg, handlers) => {
        box.handlers = handlers;
        handlers.reply = async () => ({ messageId: `r-${Math.random()}` });
        return createNullGateway();
      },
    });
    if (result.ok !== true || !box.handlers) throw new Error("bridge did not start");
    running.push(result);
    const handlers = box.handlers;
    const task = `TASK: ${"refactor the scheduler store ".repeat(40)}`.trim();
    await handlers.onMessage(mention("m1", OWNER, task));
    // Nine messages: under the DISCORD-6 rate limit (10 a minute).
    for (let i = 2; i <= 7; i += 1) {
      await handlers.onMessage(
        replyTo(`m${i}`, OWNER, `step ${i}: ${"details ".repeat(80)}`.trim(), answerId(outbound, i - 2)),
      );
    }
    const latest = `LATEST: ${"only touch the cron parser ".repeat(30)}`.trim();
    await handlers.onMessage(replyTo("m8", OWNER, latest, answerId(outbound, 6)));
    await handlers.onMessage(replyTo("m9", OWNER, "go on", answerId(outbound, 7)));
    expect(calls).toHaveLength(9);

    const last = call(calls, 8).prompt;
    const thread = last.slice(last.indexOf("[Corvidinho earlier conversation"));
    expect(thread.length).toBeLessThan(condenseBudgetChars(2048));
    expect(thread).toContain(SUMMARY_LABEL);
    expect(thread).toContain(`Human: ${task}\n`);
    expect(thread).toContain(`Human: ${latest}\n`);
    expect(thread).toContain("- Human: step 2:");
    expect(thread).not.toContain(`step 2: ${"details ".repeat(80)}`.trim());
    expect(last.endsWith("go on")).toBe(true);
  });
});

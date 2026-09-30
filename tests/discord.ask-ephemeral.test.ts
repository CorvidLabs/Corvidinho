/**
 * DISCORD-ASK + SESSION-MULTI — bridge posts Choose stub with components;
 * button pick resumes; chat while pending does not clear button asks;
 * multi-user independence.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HumanAsk } from "../src/agent/types.ts";
import type { AgentClient } from "../src/discord/agent-client.ts";
import {
  ASK_CHOICE_EXPIRED,
  ASK_STUB_HINT,
  openCustomId,
  parseAskCustomId,
  pickCustomId,
  toPendingAsk,
} from "../src/discord/ask-buttons.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { CLOSED_ASKS_MAX, SessionStore } from "../src/discord/session-store.ts";
import { ASK_CANCELLED_ACK } from "../src/discord/thin-ack.ts";
import { EPHEMERAL_SILENT_ACK } from "../src/discord/types.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
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

const CACHE_ASK: HumanAsk = {
  reason: "clarify",
  question: "Which cache?",
  options: [
    { id: "1", label: "Redis" },
    { id: "2", label: "Memcached" },
  ],
};

/** No listable options → free-text clarify (DISCORD-ASK-4). */
const NAME_ASK: HumanAsk = {
  reason: "clarify",
  question: "What should the new table be called?",
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
    const { result, handlers, replies, outbound } = await bridgeWith(agent);
    await handlers.onMessage({
      id: "m1",
      channelId: "chan-1",
      authorId: "user-1",
      authorBot: false,
      content: "@bot pick a DB",
      mentionedBot: true,
    });
    // DISCORD-ASK-6 — collapse thinking into one Choose stub (no separate
    // stub reply); an edit does not notify, so one fresh post pings the
    // requester with no buttons (REQ-discord-215).
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toBe("<@user-1> ↑ question for you");
    expect(replies[0]!.mentionUserIds).toEqual(["user-1"]);
    expect(replies[0]!.components).toBeUndefined();
    expect(outbound.sends).toHaveLength(1);
    const stubEdit = outbound.contentEdits.find(
      (e) => typeof e.content === "string" && e.content.includes("Choose"),
    );
    expect(stubEdit).toBeDefined();
    expect(String(stubEdit!.content)).not.toContain("Postgres");
    expect(stubEdit!.components).toBeDefined();
    expect(stubEdit!.embed).toBeNull();
    const stubId = stubEdit!.messageId;
    const pending = result.store.getByBotMessage(stubId)!.pendingAsk!;
    expect(pending.options?.map((o) => o.label)).toEqual(["Postgres", "SQLite"]);
    expect(pending.askId).toBeTruthy();
    expect(pending.stubMessageId).toBe(stubId);
    // No leftover "Needs your input" thinking Done embed.
    const needsInput = outbound.edits.some(
      (e) =>
        typeof (e.embed as { description?: string })?.description === "string" &&
        String((e.embed as { description?: string }).description).includes(
          "Needs your input",
        ),
    );
    expect(needsInput).toBe(false);
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
    const { result, handlers, replies, calls, outbound } = await bridgeWith(agent);
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
    const stubId = pending.stubMessageId!;

    const eph: Array<Record<string, unknown>> = [];
    const openIx: ComponentInteraction = {
      id: "ix-open",
      customId: openCustomId(askId),
      channelId: "chan-1",
      userId: "user-1",
      messageId: stubId,
      reply: async (opts) => {
        eph.push(opts as Record<string, unknown>);
      },
    };
    await handlers.onComponent!(openIx);
    expect(eph).toHaveLength(1);
    expect(eph[0]!.ephemeral).toBe(true);
    expect(String(eph[0]!.content)).toContain("Which DB?");
    expect(eph[0]!.components).toBeDefined();

    let deleted = 0;
    await handlers.onComponent!({
      id: "ix-pick",
      customId: pickCustomId(askId, "1"),
      channelId: "chan-1",
      userId: "user-1",
      messageId: stubId,
      reply: async (opts) => {
        eph.push(opts as Record<string, unknown>);
      },
      deleteReply: async () => {
        deleted += 1;
      },
    });
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[1]!.humanText).toBe("Postgres");
    expect(result.store.list()[0]!.pendingAsk ?? null).toBeNull();
    // DISCORD-ASK-8 — pick update clears option buttons; ephemeral deleted after resume.
    const pickAck = eph.find(
      (e) => typeof e.content === "string" && String(e.content).includes("Got it"),
    );
    expect(pickAck).toBeDefined();
    expect(pickAck!.update).toBe(true);
    expect(pickAck!.components).toEqual([]);
    expect(deleted).toBe(1);
    // Re-press after clear is no-op / already-answered (no second resume).
    const before = calls.length;
    const reEph: string[] = [];
    await handlers.onComponent!({
      id: "ix-repress",
      customId: pickCustomId(askId, "2"),
      channelId: "chan-1",
      userId: "user-1",
      messageId: stubId,
      reply: async (opts) => {
        reEph.push(opts.content ?? "");
      },
    });
    expect(calls.length).toBe(before);
    expect(reEph[0]?.toLowerCase()).toContain("already");
    // DISCORD-ASK-7 — final answer edited into stub/thinking; no extra reply.
    expect(replies.some((r) => r.content.includes("Using Postgres"))).toBe(false);
    const answerEdit = outbound.contentEdits.find(
      (e) =>
        typeof e.content === "string" && e.content.includes("Using Postgres"),
    );
    expect(answerEdit).toBeDefined();
    expect(answerEdit!.messageId).toBe(stubId);

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


/** Agent that answers each run with the next scripted ask (or a done reply). */
function scriptedAgent(steps: Array<HumanAsk | string>): AgentClient {
  let n = 0;
  return {
    async runChat({ sessionId }) {
      const step = steps[n] ?? "done";
      n += 1;
      if (typeof step === "string") {
        return {
          ok: true,
          sessionId,
          summary: step,
          exitCode: 0,
          task: { verified: true, verifySkipped: false, state: "done" },
        };
      }
      return {
        ok: true,
        sessionId,
        summary: "need input",
        exitCode: 0,
        ask: step,
        task: { verified: false, verifySkipped: true, state: "blocked" },
      };
    },
  };
}

async function press(
  handlers: GatewayHandlers,
  customId: string,
  userId = "user-1",
): Promise<Array<Record<string, unknown>>> {
  const eph: Array<Record<string, unknown>> = [];
  await handlers.onComponent!({
    id: `ix-${customId}`,
    customId,
    channelId: "chan-1",
    userId,
    reply: async (opts) => {
      eph.push(opts as Record<string, unknown>);
    },
    deleteReply: async () => {},
  });
  return eph;
}

function say(handlers: GatewayHandlers, id: string, content: string) {
  return handlers.onMessage({
    id,
    channelId: "chan-1",
    authorId: "user-1",
    authorBot: false,
    content: `<@999> ${content}`,
    mentionedBot: true,
  });
}

describe("open button asks are keyed by askId (SESSION-MULTI-3 / REQ-discord-044)", () => {
  test("a side-chat run that asks again keeps the earlier Choose buttons until pressed", async () => {
    const { result, handlers, replies, calls } = await bridgeWith(
      scriptedAgent([OPTIONS_ASK, CACHE_ASK, "Using Postgres", "Using Redis"]),
    );
    await say(handlers, "m1", "set up storage");
    const askA = result.store.list()[0]!.pendingAsk!;
    expect(askA.question).toBe("Which DB?");
    await say(handlers, "m2", "meanwhile, what about caching?");
    const session = result.store.list()[0]!;
    const askB = session.pendingAsk!;
    // The newer ask is the session's pendingAsk; the earlier one stays open.
    expect(askB.question).toBe("Which cache?");
    expect(askB.askId).not.toBe(askA.askId);
    expect(session.openAsks?.map((a) => a.askId)).toEqual([askA.askId]);

    // A thin reply restates the newest ask with its own Choose button.
    await say(handlers, "m3", "ok");
    expect(calls).toHaveLength(2);
    expect(JSON.stringify(replies.at(-1)!.components)).toContain(openCustomId(askB.askId));

    // The earlier Choose button still opens its choices…
    const openA = await press(handlers, openCustomId(askA.askId));
    expect(openA).toHaveLength(1);
    expect(String(openA[0]!.content)).toContain("Which DB?");
    expect(JSON.stringify(openA[0]!.components)).toContain(pickCustomId(askA.askId, "1"));

    // …and a pick resumes the session with that ask's question and label.
    const pickA = await press(handlers, pickCustomId(askA.askId, "1"));
    expect(String(pickA[0]!.content)).toContain("Postgres");
    expect(calls).toHaveLength(3);
    expect(calls[2]!.humanText).toBe("Postgres");
    expect(calls[2]!.prompt).toContain(
      "[Prior clarifying question you asked (the human answered via Discord button):\nWhich DB?]",
    );

    // Only the pressed ask cleared; the newer one is still open.
    const after = result.store.list()[0]!;
    expect(after.pendingAsk?.askId).toBe(askB.askId);
    expect(after.openAsks).toBeUndefined();
    const again = await press(handlers, pickCustomId(askA.askId, "2"));
    expect(String(again[0]!.content).toLowerCase()).toContain("already");
    expect(calls).toHaveLength(3);

    const openB = await press(handlers, openCustomId(askB.askId));
    expect(String(openB[0]!.content)).toContain("Which cache?");
    await press(handlers, pickCustomId(askB.askId, "1"));
    expect(calls).toHaveLength(4);
    expect(calls[3]!.humanText).toBe("Redis");
    expect(calls[3]!.prompt).toContain(
      "[Prior clarifying question you asked (the human answered via Discord button):\nWhich cache?]",
    );
    expect(result.store.list()[0]!.pendingAsk ?? null).toBeNull();
    await result.stop();
  });

  test("a free-text answer clears only that ask; the earlier button ask stays open", async () => {
    const { result, handlers, calls } = await bridgeWith(
      scriptedAgent([OPTIONS_ASK, NAME_ASK, "Named it users", "Using SQLite"]),
    );
    await say(handlers, "m1", "set up storage");
    const askA = result.store.list()[0]!.pendingAsk!;
    await say(handlers, "m2", "also add a table");
    const free = result.store.list()[0]!.pendingAsk!;
    expect(free.question).toBe(NAME_ASK.question);
    expect(free.options).toBeUndefined();

    await say(handlers, "m3", "call it users");
    expect(calls).toHaveLength(3);
    expect(calls[2]!.prompt).toContain(
      `[Prior clarifying question you asked (the human is answering it now):\n${NAME_ASK.question}]`,
    );
    // The answered free-text ask is gone; the button ask is pending again.
    expect(result.store.list()[0]!.pendingAsk?.askId).toBe(askA.askId);

    const openA = await press(handlers, openCustomId(askA.askId));
    expect(String(openA[0]!.content)).toContain("Which DB?");
    await press(handlers, pickCustomId(askA.askId, "2"));
    expect(calls).toHaveLength(4);
    expect(calls[3]!.humanText).toBe("SQLite");
    expect(calls[3]!.prompt).toContain(
      "[Prior clarifying question you asked (the human answered via Discord button):\nWhich DB?]",
    );
    expect(result.store.list()[0]!.pendingAsk ?? null).toBeNull();
    await result.stop();
  });

  test("a late press on an earlier ask expires only that ask", async () => {
    const { result, handlers, calls } = await bridgeWith(
      scriptedAgent([OPTIONS_ASK, CACHE_ASK]),
    );
    await say(handlers, "m1", "set up storage");
    const askA = result.store.list()[0]!.pendingAsk!;
    await say(handlers, "m2", "and caching?");
    const session = result.store.list()[0]!;
    const askB = session.pendingAsk!;
    session.openAsks![0]!.expiresAt = Date.now() - 1;

    const late = await press(handlers, pickCustomId(askA.askId, "1"));
    expect(late[0]!.content).toBe(ASK_CHOICE_EXPIRED);
    expect(calls).toHaveLength(2);
    expect(result.store.list()[0]!.pendingAsk?.askId).toBe(askB.askId);
    expect(result.store.list()[0]!.openAsks).toBeUndefined();
    const openB = await press(handlers, openCustomId(askB.askId));
    expect(String(openB[0]!.content)).toContain("Which cache?");
    await result.stop();
  });

  test("an earlier ask past its timeout is never promoted, so a thin reply after the newest pick runs the agent", async () => {
    const { result, handlers, replies, calls } = await bridgeWith(
      scriptedAgent([OPTIONS_ASK, CACHE_ASK, "Using Redis", "You're welcome"]),
    );
    await say(handlers, "m1", "set up storage");
    const askA = result.store.list()[0]!.pendingAsk!;
    await say(handlers, "m2", "and caching?");
    const session = result.store.list()[0]!;
    const askB = session.pendingAsk!;
    session.openAsks![0]!.expiresAt = Date.now() - 1;

    await press(handlers, pickCustomId(askB.askId, "1"));
    expect(calls).toHaveLength(3);
    // The timed-out ask A is dropped, not promoted to be restated.
    const after = result.store.list()[0]!;
    expect(after.pendingAsk ?? null).toBeNull();
    expect(after.openAsks).toBeUndefined();

    const before = replies.length;
    await say(handlers, "m3", "ok");
    expect(calls).toHaveLength(4);
    expect(calls[3]!.prompt).not.toContain("Which DB?]");
    expect(replies.slice(before).some((r) => r.content.includes("Which DB?"))).toBe(false);
    // DISCORD-ASK-5: the dropped ask timed out, so a press on it is a late
    // press — "that choice expired", not "already answered", and no run.
    const late = await press(handlers, openCustomId(askA.askId));
    expect(late).toEqual([{ content: ASK_CHOICE_EXPIRED, ephemeral: true }]);
    expect(calls).toHaveLength(4);
    await result.stop();
  });

  test("an explicit cancel clears every open ask of the session", async () => {
    const { result, handlers, replies, calls } = await bridgeWith(
      scriptedAgent([OPTIONS_ASK, CACHE_ASK]),
    );
    await say(handlers, "m1", "set up storage");
    const askA = result.store.list()[0]!.pendingAsk!;
    await say(handlers, "m2", "and caching?");
    const askB = result.store.list()[0]!.pendingAsk!;
    // Both asks are open before the cancel.
    expect(result.store.list()[0]!.openAsks?.map((a) => a.askId)).toEqual([askA.askId]);
    await say(handlers, "m3", "cancel");
    expect(calls).toHaveLength(2);
    expect(replies.at(-1)!.content).toBe(ASK_CANCELLED_ACK);
    const session = result.store.list()[0]!;
    expect(session.pendingAsk ?? null).toBeNull();
    expect(session.openAsks).toBeUndefined();
    for (const askId of [askA.askId, askB.askId]) {
      const eph = await press(handlers, openCustomId(askId));
      expect(String(eph[0]!.content).toLowerCase()).toContain("already");
    }
    await result.stop();
  });

  test("SessionStore keeps open asks by askId and persists them across a reopen", () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-open-asks-"));
    try {
      const path = join(dir, "corvidinho.db");
      const db1 = openCorvidinhoDb({ path });
      const store1 = new SessionStore({ db: db1 });
      const s = store1.create({ channelId: "chan-1", userId: "user-1" });
      const a = toPendingAsk(OPTIONS_ASK, { askId: "aska" });
      const b = toPendingAsk(CACHE_ASK, { askId: "askb" });
      store1.setPendingAsk(s, a);
      const rowOf = (db: typeof db1) =>
        (db.query("SELECT pending_ask FROM discord_sessions WHERE id = ?").get(s.id) as {
          pending_ask: string | null;
        }).pending_ask;
      // One open ask keeps today's single-object row.
      expect(JSON.parse(rowOf(db1)!).askId).toBe("aska");
      store1.setPendingAsk(s, b);
      expect(s.pendingAsk?.askId).toBe("askb");
      expect(s.openAsks?.map((x) => x.askId)).toEqual(["aska"]);
      // Re-storing a held askId updates it in place (no reorder, no duplicate).
      store1.setPendingAsk(s, { ...a, stubMessageId: "stub-a" });
      expect(s.pendingAsk?.askId).toBe("askb");
      expect(s.openAsks?.map((x) => [x.askId, x.stubMessageId])).toEqual([["aska", "stub-a"]]);
      expect(store1.findPendingAsk("aska")?.ask.stubMessageId).toBe("stub-a");
      expect(store1.findPendingAsk("askb")?.session.id).toBe(s.id);
      expect(store1.findPendingAsk("nope")).toBeUndefined();
      const stored = JSON.parse(rowOf(db1)!) as Array<{ askId: string }>;
      expect(stored.map((x) => x.askId)).toEqual(["aska", "askb"]);
      db1.close();

      const db2 = openCorvidinhoDb({ path });
      const store2 = new SessionStore({ db: db2 });
      const reloaded = store2.get(s.id)!;
      expect(reloaded.pendingAsk?.askId).toBe("askb");
      expect(reloaded.openAsks?.map((x) => x.askId)).toEqual(["aska"]);
      expect(store2.findPendingAsk("aska")?.ask.question).toBe("Which DB?");
      // Clearing the newest promotes the earlier open ask.
      store2.clearPendingAsk(reloaded, "askb");
      expect(reloaded.pendingAsk?.askId).toBe("aska");
      expect(reloaded.openAsks).toBeUndefined();
      expect(JSON.parse(rowOf(db2)!).askId).toBe("aska");
      // A new free-text ask sits beside the button ask; a later ask replaces
      // the free-text one, never the button one.
      store2.setPendingAsk(reloaded, toPendingAsk(NAME_ASK, { askId: "free1" }));
      store2.setPendingAsk(reloaded, toPendingAsk(NAME_ASK, { askId: "free2" }));
      expect(reloaded.pendingAsk?.askId).toBe("free2");
      expect(reloaded.openAsks?.map((x) => x.askId)).toEqual(["aska"]);
      expect(store2.findPendingAsk("free1")).toBeUndefined();
      // Cancel (null) clears them all.
      store2.setPendingAsk(reloaded, null);
      expect(reloaded.pendingAsk).toBeNull();
      expect(reloaded.openAsks).toBeUndefined();
      expect(rowOf(db2)).toBeNull();
      db2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/** ask-human options that repeat one id (DISCORD-ASK-1/3). */
const DUP_ID_ASK: HumanAsk = {
  reason: "clarify",
  question: "Which?",
  options: [
    { id: "x", label: "Keep" },
    { id: "x", label: "Drop" },
  ],
};

function pickIds(eph: Array<Record<string, unknown>>): string[] {
  const rows = (eph[0]?.components ?? []) as Array<{
    components: Array<{ custom_id: string }>;
  }>;
  return rows.flatMap((r) => r.components.map((b) => b.custom_id));
}

describe("ask option ids and expired button asks (DISCORD-ASK-1/3/5)", () => {
  test("options with a repeated id open as distinct buttons and a pick resumes with the pressed label", async () => {
    const { result, handlers, calls } = await bridgeWith(
      scriptedAgent([DUP_ID_ASK, "Dropped it"]),
    );
    await say(handlers, "m1", "tidy the table");
    const pending = result.store.list()[0]!.pendingAsk!;
    expect(new Set(pending.options!.map((o) => o.id)).size).toBe(2);

    const opened = await press(handlers, openCustomId(pending.askId));
    const customIds = pickIds(opened);
    expect(customIds).toHaveLength(2);
    expect(new Set(customIds).size).toBe(2);

    await press(handlers, customIds[1]!);
    expect(calls).toHaveLength(2);
    expect(calls.at(-1)!.humanText).toBe("Drop");
    // SAFE-12.a: no owner is configured here, so the presser is community and
    // the picked label reaches the run inside the untrusted-data fence.
    expect(calls.at(-1)!.prompt).toMatch(
      /Human answer:\n\[untrusted message from the acting user \(role: community\)[^\n]*\n<<<UNTRUSTED_DATA id=[0-9a-f]{12} source=ask-pick>>>\nDrop\n<<<END_UNTRUSTED_DATA id=[0-9a-f]{12}>>>/,
    );
    await result.stop();
  });

  test("a thin reply after the button ask timed out runs the agent, not a restated Choose", async () => {
    const { result, handlers, replies, calls } = await bridgeWith(
      scriptedAgent([OPTIONS_ASK, "ran"]),
    );
    await say(handlers, "m1", "pick a db");
    const session = result.store.list()[0]!;
    const askId = session.pendingAsk!.askId;
    session.pendingAsk!.expiresAt = Date.now() - 1000;

    const before = replies.length;
    await say(handlers, "m2", "ok");
    expect(calls).toHaveLength(2);
    expect(calls[1]!.prompt).not.toContain("Which DB?]");
    const after = replies.slice(before);
    expect(after.some((r) => JSON.stringify(r.components ?? []).includes(openCustomId(askId)))).toBe(
      false,
    );
    expect(after.some((r) => r.content.includes(ASK_STUB_HINT))).toBe(false);
    expect(result.store.list()[0]!.pendingAsk ?? null).toBeNull();
    await result.stop();
  });

  test("a thin reply after the newest button ask timed out restates the newest one still live", async () => {
    const { result, handlers, replies, calls } = await bridgeWith(
      scriptedAgent([OPTIONS_ASK, CACHE_ASK]),
    );
    await say(handlers, "m1", "set up storage");
    const askA = result.store.list()[0]!.pendingAsk!;
    await say(handlers, "m2", "and caching?");
    const session = result.store.list()[0]!;
    const askB = session.pendingAsk!;
    session.pendingAsk!.expiresAt = Date.now() - 1000;

    await say(handlers, "m3", "ok");
    expect(calls).toHaveLength(2);
    const restated = JSON.stringify(replies.at(-1)!.components);
    expect(restated).toContain(openCustomId(askA.askId));
    expect(restated).not.toContain(openCustomId(askB.askId));
    const now = result.store.list()[0]!;
    expect(now.pendingAsk?.askId).toBe(askA.askId);
    expect(now.openAsks).toBeUndefined();
    await result.stop();
  });

  test("a substantive reply after the button ask timed out runs the agent and clears it", async () => {
    const { result, handlers, calls } = await bridgeWith(
      scriptedAgent([OPTIONS_ASK, "ran", "ran again"]),
    );
    await say(handlers, "m1", "pick a db");
    result.store.list()[0]!.pendingAsk!.expiresAt = Date.now() - 1000;

    await say(handlers, "m2", "never mind, what time is it?");
    expect(calls).toHaveLength(2);
    expect(result.store.list()[0]!.pendingAsk ?? null).toBeNull();
    await say(handlers, "m3", "ok");
    expect(calls).toHaveLength(3);
    await result.stop();
  });

  test("cancel after the button ask timed out still gets the short ack and no agent run", async () => {
    const { result, handlers, replies, calls } = await bridgeWith(
      scriptedAgent([OPTIONS_ASK, "ran"]),
    );
    await say(handlers, "m1", "pick a db");
    result.store.list()[0]!.pendingAsk!.expiresAt = Date.now() - 1000;

    await say(handlers, "m2", "cancel");
    expect(calls).toHaveLength(1);
    expect(replies.at(-1)!.content).toBe(ASK_CANCELLED_ACK);
    expect(result.store.list()[0]!.pendingAsk ?? null).toBeNull();
    await result.stop();
  });
});

const NOT_YOURS = "This choice isn’t for you (or it was already answered).";
const EXPIRED_REPLY = [{ content: ASK_CHOICE_EXPIRED, ephemeral: true }];

/** Push the session's last activity past the soft TTL (SESSION-2). */
function idlePastTtl(session: { lastActivityAt: number }): void {
  session.lastActivityAt = Date.now() - 2 * 60 * 60 * 1000;
}

describe("a late press on an ask that is no longer open (DISCORD-ASK-5 / REQ-discord-045)", () => {
  test("an ask dropped at the newest pick: the requester's Choose and option press get 'that choice expired', no run; another user's press gets not-for-you", async () => {
    const { result, handlers, replies, calls, outbound } = await bridgeWith(
      scriptedAgent([OPTIONS_ASK, CACHE_ASK, "Using Redis"]),
    );
    await say(handlers, "m1", "set up storage");
    const askA = result.store.list()[0]!.pendingAsk!;
    await say(handlers, "m2", "and caching?");
    const session = result.store.list()[0]!;
    const askB = session.pendingAsk!;
    session.openAsks![0]!.expiresAt = Date.now() - 1;
    await press(handlers, pickCustomId(askB.askId, "1"));
    expect(calls).toHaveLength(3);
    expect(result.store.findPendingAsk(askA.askId)).toBeUndefined();

    const posted = replies.length + outbound.sends.length + outbound.contentEdits.length;
    expect(await press(handlers, openCustomId(askA.askId))).toEqual(EXPIRED_REPLY);
    expect(await press(handlers, pickCustomId(askA.askId, "2"))).toEqual(EXPIRED_REPLY);
    // Another user never learns it was an ask of someone else's that expired.
    expect(await press(handlers, pickCustomId(askA.askId, "1"), "user-2")).toEqual([
      { content: NOT_YOURS, ephemeral: true },
    ]);
    expect(calls).toHaveLength(3);
    expect(replies.length + outbound.sends.length + outbound.contentEdits.length).toBe(posted);
    await result.stop();
  });

  test("an ask whose session was TTL-purged: the requester's press gets 'that choice expired', no run and no new session", async () => {
    const { result, handlers, replies, calls, outbound } = await bridgeWith(
      scriptedAgent([OPTIONS_ASK, CACHE_ASK, "unused"]),
    );
    await say(handlers, "m1", "set up storage");
    const askA = result.store.list()[0]!.pendingAsk!;
    await say(handlers, "m2", "and caching?");
    const session = result.store.list()[0]!;
    const askB = session.pendingAsk!;
    expect(session.openAsks?.map((a) => a.askId)).toEqual([askA.askId]);
    // Neither ask has timed out yet: only the session is idle past its TTL.
    expect(askA.expiresAt).toBeGreaterThan(Date.now());
    // DISCORD-ASK-2/3: before the purge another user's press on the live ask
    // is not-for-you and resumes nothing.
    expect(await press(handlers, pickCustomId(askB.askId, "1"), "user-2")).toEqual([
      { content: NOT_YOURS, ephemeral: true },
    ]);
    expect(calls).toHaveLength(2);
    idlePastTtl(session);

    const posted = replies.length + outbound.sends.length + outbound.contentEdits.length;
    for (const askId of [askA.askId, askB.askId]) {
      expect(await press(handlers, openCustomId(askId))).toEqual(EXPIRED_REPLY);
      expect(await press(handlers, pickCustomId(askId, "1"))).toEqual(EXPIRED_REPLY);
      expect(await press(handlers, pickCustomId(askId, "1"), "user-2")).toEqual([
        { content: NOT_YOURS, ephemeral: true },
      ]);
    }
    expect(calls).toHaveLength(2);
    expect(result.store.list()).toHaveLength(0);
    expect(replies.length + outbound.sends.length + outbound.contentEdits.length).toBe(posted);
    await result.stop();
  });

  test("a still-stored ask past its timeout keeps today's reply and is cleared; a second late press is still 'that choice expired'", async () => {
    const { result, handlers, calls } = await bridgeWith(scriptedAgent([OPTIONS_ASK]));
    await say(handlers, "m1", "set up storage");
    const session = result.store.list()[0]!;
    const ask = session.pendingAsk!;
    ask.expiresAt = Date.now() - 1;
    expect(await press(handlers, pickCustomId(ask.askId, "1"))).toEqual(EXPIRED_REPLY);
    expect(result.store.list()[0]!.pendingAsk ?? null).toBeNull();
    expect(await press(handlers, openCustomId(ask.askId))).toEqual(EXPIRED_REPLY);
    expect(await press(handlers, openCustomId(ask.askId), "user-2")).toEqual([
      { content: NOT_YOURS, ephemeral: true },
    ]);
    expect(calls).toHaveLength(1);
    await result.stop();
  });

  test("DISCORD-ASK-8 holds: a re-press after a pick and a press after cancel stay no-ops with today's reply, even after the session is purged", async () => {
    const { result, handlers, calls } = await bridgeWith(
      scriptedAgent([OPTIONS_ASK, "Using Postgres", CACHE_ASK]),
    );
    await say(handlers, "m1", "set up storage");
    const picked = result.store.list()[0]!.pendingAsk!;
    await press(handlers, pickCustomId(picked.askId, "1"));
    expect(calls).toHaveLength(2);
    await say(handlers, "m2", "and caching?");
    const cancelled = result.store.list()[0]!.pendingAsk!;
    expect(cancelled.askId).not.toBe(picked.askId);
    await say(handlers, "m3", "cancel");
    expect(calls).toHaveLength(3);

    const nowAndAfterPurge = async () => {
      for (const askId of [picked.askId, cancelled.askId]) {
        const eph = await press(handlers, pickCustomId(askId, "2"));
        expect(eph).toEqual([{ content: NOT_YOURS, ephemeral: true }]);
      }
      expect(calls).toHaveLength(3);
    };
    await nowAndAfterPurge();
    idlePastTtl(result.store.list()[0]!);
    expect(result.store.list()).toHaveLength(0);
    await nowAndAfterPurge();
    await result.stop();
  });

  test("inside a thread under the allowlisted channel (DISCORD-2.a): a late press on a dropped or a TTL-purged ask is 'that choice expired', with the same channel gate as a live press", async () => {
    const { result, handlers, calls } = await bridgeWith(
      scriptedAgent([OPTIONS_ASK, CACHE_ASK, "Using Redis"]),
    );
    const sayIn = (id: string, content: string) =>
      handlers.onMessage({
        id,
        channelId: "chan-1",
        threadId: "thr-1",
        authorId: "user-1",
        authorBot: false,
        content: `<@999> ${content}`,
        mentionedBot: true,
      });
    const pressIn = async (customId: string, channelId: string, userId = "user-1") => {
      const eph: Array<Record<string, unknown>> = [];
      await handlers.onComponent!({
        id: `ix-${customId}-${channelId}`,
        customId,
        channelId,
        userId,
        reply: async (opts) => {
          eph.push(opts as Record<string, unknown>);
        },
        deleteReply: async () => {},
      });
      return eph;
    };
    await sayIn("t1", "set up storage");
    const session = result.store.list()[0]!;
    expect(session.threadId).toBe("thr-1");
    const askA = session.pendingAsk!;
    await sayIn("t2", "and caching?");
    const askB = session.pendingAsk!;
    session.openAsks![0]!.expiresAt = Date.now() - 1;
    await pressIn(pickCustomId(askB.askId, "1"), "thr-1");
    expect(calls).toHaveLength(3);
    expect(result.store.findPendingAsk(askA.askId)).toBeUndefined();

    // The dropped ask, pressed in the talk's thread.
    expect(await pressIn(openCustomId(askA.askId), "thr-1")).toEqual(EXPIRED_REPLY);
    expect(await pressIn(pickCustomId(askA.askId, "2"), "thr-1")).toEqual(EXPIRED_REPLY);
    expect(await pressIn(pickCustomId(askA.askId, "2"), "thr-1", "user-2")).toEqual([
      { content: NOT_YOURS, ephemeral: true },
    ]);
    // Another thread, or a channel off the allowlist, stays zero-width.
    expect(await pressIn(openCustomId(askA.askId), "thr-2")).toEqual([
      { content: EPHEMERAL_SILENT_ACK, ephemeral: true },
    ]);

    // A newer, live ask in the thread, then the talk idles past its TTL.
    const askC = toPendingAsk(OPTIONS_ASK);
    result.store.setPendingAsk(session, askC);
    idlePastTtl(session);
    const ran = calls.length;
    expect(await pressIn(openCustomId(askC.askId), "thr-1")).toEqual(EXPIRED_REPLY);
    expect(await pressIn(pickCustomId(askC.askId, "1"), "thr-1")).toEqual(EXPIRED_REPLY);
    expect(await pressIn(pickCustomId(askC.askId, "1"), "chan-off")).toEqual([
      { content: EPHEMERAL_SILENT_ACK, ephemeral: true },
    ]);
    // Once the talk's own channel leaves the allowlist, a press in its
    // thread is zero-width, as on a live ask (REQ-discord-212).
    result.config.allowlist.discord.channels = ["chan-other"];
    expect(await pressIn(pickCustomId(askC.askId, "1"), "thr-1")).toEqual([
      { content: EPHEMERAL_SILENT_ACK, ephemeral: true },
    ]);
    expect(calls).toHaveLength(ran);
    expect(result.store.list()).toHaveLength(0);
    await result.stop();
  });

  test("SessionStore keeps closed asks as askId, user, expiry and the talk's channel/thread only — from a TTL purge, a drop, a late clear and a reload — never a pick or a cancel", () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-closed-asks-"));
    try {
      const path = join(dir, "corvidinho.db");
      let now = 1_000_000_000_000;
      const ttlMs = 45 * 60 * 1000;
      const db1 = openCorvidinhoDb({ path });
      const store1 = new SessionStore({ db: db1, ttlMs, now: () => now });

      // A pick of a live ask and a cancel close nothing (DISCORD-ASK-8).
      const s = store1.create({ channelId: "chan-1", userId: "user-1" });
      store1.setPendingAsk(s, toPendingAsk(OPTIONS_ASK, { askId: "picked", nowMs: now }));
      store1.clearPendingAsk(s, "picked");
      store1.setPendingAsk(s, toPendingAsk(OPTIONS_ASK, { askId: "cancelled", nowMs: now }));
      store1.setPendingAsk(s, null);
      expect(store1.findClosedAsk("picked")).toBeUndefined();
      expect(store1.findClosedAsk("cancelled")).toBeUndefined();

      // An earlier ask past its timeout is dropped at the newest pick: closed.
      store1.setPendingAsk(s, toPendingAsk(OPTIONS_ASK, { askId: "old", nowMs: now - 31 * 60 * 1000 }));
      store1.setPendingAsk(s, toPendingAsk(CACHE_ASK, { askId: "new", nowMs: now }));
      store1.clearPendingAsk(s, "new");
      expect(s.pendingAsk ?? null).toBeNull();
      const old = store1.findClosedAsk("old")!;
      expect(old).toEqual({
        askId: "old",
        userId: "user-1",
        expiresAt: now - 60 * 1000,
        channelId: "chan-1",
      });
      // No question or option text is kept (SAFE-6).
      expect(JSON.stringify(old)).not.toContain("Which DB?");
      expect(JSON.stringify(old)).not.toContain("Postgres");
      expect(store1.findClosedAsk("new")).toBeUndefined();

      // The late-pressed ask itself, cleared past its timeout: closed.
      store1.setPendingAsk(s, toPendingAsk(OPTIONS_ASK, { askId: "late", nowMs: now - 31 * 60 * 1000 }));
      store1.clearPendingAsk(s, "late");
      expect(store1.findClosedAsk("late")?.userId).toBe("user-1");

      // A TTL purge closes every open ask of the session, timed out or not.
      const a1 = toPendingAsk(OPTIONS_ASK, { askId: "a1", nowMs: now });
      store1.setPendingAsk(s, a1);
      store1.setPendingAsk(s, toPendingAsk(CACHE_ASK, { askId: "a2", nowMs: now }));
      store1.touch(s);
      now += ttlMs + 1;
      expect(store1.findPendingAsk("a1")).toBeUndefined();
      expect(store1.findClosedAsk("a1")).toEqual({
        askId: "a1",
        userId: "user-1",
        expiresAt: a1.expiresAt,
        channelId: "chan-1",
      });
      expect(store1.findClosedAsk("a2")?.userId).toBe("user-1");
      // Re-opening an askId makes it open again, not closed.
      const s2 = store1.create({ channelId: "chan-1", userId: "user-2" });
      store1.setPendingAsk(s2, toPendingAsk(OPTIONS_ASK, { askId: "a2", nowMs: now }));
      expect(store1.findClosedAsk("a2")).toBeUndefined();

      // A session row reloaded past its TTL after a restart closes its asks too.
      const s3 = store1.create({ channelId: "chan-1", userId: "user-3", threadId: "thr-3" });
      store1.setPendingAsk(s3, toPendingAsk(OPTIONS_ASK, { askId: "b1", nowMs: now }));
      db1.close();
      now += ttlMs + 1;
      const db2 = openCorvidinhoDb({ path });
      const store2 = new SessionStore({ db: db2, ttlMs, now: () => now });
      expect(store2.get(s3.id)).toBeUndefined();
      expect(store2.findClosedAsk("b1")).toMatchObject({
        userId: "user-3",
        channelId: "chan-1",
        threadId: "thr-3",
      });
      db2.close();

      // Bounded: past CLOSED_ASKS_MAX the oldest closed ask is forgotten.
      const store3 = new SessionStore({ ttlMs, now: () => now });
      for (let i = 0; i <= CLOSED_ASKS_MAX; i++) {
        const si = store3.create({ channelId: "chan-1", userId: `u${i}` });
        store3.setPendingAsk(si, toPendingAsk(OPTIONS_ASK, { askId: `c${i}`, nowMs: now }));
      }
      now += ttlMs + 1;
      expect(store3.list()).toHaveLength(0);
      expect(store3.findClosedAsk("c0")).toBeUndefined();
      expect(store3.findClosedAsk("c1")?.userId).toBe("u1");
      expect(store3.findClosedAsk(`c${CLOSED_ASKS_MAX}`)?.userId).toBe(`u${CLOSED_ASKS_MAX}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

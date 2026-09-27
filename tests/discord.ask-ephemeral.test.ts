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
  openCustomId,
  parseAskCustomId,
  pickCustomId,
  toPendingAsk,
} from "../src/discord/ask-buttons.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import { ASK_CANCELLED_ACK } from "../src/discord/thin-ack.ts";
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
    const late = await press(handlers, openCustomId(askA.askId));
    expect(String(late[0]!.content).toLowerCase()).toContain("already");
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

/**
 * In-flight replies + restart recovery (REQ-discord-311, DISCORD-3 / AGENT-3).
 * A bridge that dies mid-reply leaves its progress embed at "working…"; the
 * next start marks it interrupted (or replies) and forgets the row. With
 * DISCORD-ASK-6/7 the progress message is edited into the answer / Choose stub
 * when `editMessage` exists; the row is deleted the moment that lands.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import { Database as SqliteDatabase } from "bun:sqlite";
import { loadLlmEnv } from "../src/agent/execute.ts";
import type { HumanAsk } from "../src/agent/types.ts";
import type { AgentClient } from "../src/discord/agent-client.ts";
import { createEchoAgentClient } from "../src/discord/agent-client.ts";
import { pickCustomId } from "../src/discord/ask-buttons.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import {
  createNullGateway,
  type GatewayHandlers,
} from "../src/discord/gateway.ts";
import {
  INTERRUPTED_REPLY_STATUS,
  InflightReplyStore,
  recoverInterruptedReplies,
} from "../src/discord/inflight-replies.ts";
import {
  THINKING_COLORS,
  type DiscordEmbedPayload,
  type EditMessageOpts,
} from "../src/discord/thinking-status.ts";
import type { InboundMessage } from "../src/discord/types.ts";
import { migrateCorvidinhoDb, openCorvidinhoDb, SCHEMA_VERSION } from "../src/store/db.ts";

const ENV = {
  DISCORD_BOT_TOKEN: "fake",
  DISCORD_CHANNEL_IDS: "chan-1",
  CORVIDINHO_DISCORD_DRY_RUN: "1",
};

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

/** Temp non-git project: never create real worktrees/branches in this repo. */
function tempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "corvidinho-inflight-proj-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function memDb(): Database {
  const db = openCorvidinhoDb({ memory: true });
  cleanups.push(() => db.close());
  return db;
}

function inflightRows(db: Database): Array<Record<string, unknown>> {
  return db.query("SELECT * FROM discord_inflight_replies").all() as Array<
    Record<string, unknown>
  >;
}

function mention(id: string, content = "@bot do a thing"): InboundMessage {
  return {
    id,
    channelId: "chan-1",
    authorId: "u1",
    authorBot: false,
    content,
    mentionedBot: true,
  };
}

/**
 * Fake live Discord surface: records every send/edit/reply. `editMessage`
 * (true or a handler) wires the DISCORD-ASK-6/7 in-place edit so the bridge
 * collapses the progress message into the answer / Choose stub.
 */
function fakeDiscord(over: {
  editEmbed?: GatewayHandlers["editEmbed"];
  reply?: GatewayHandlers["reply"];
  editMessage?: true | ((o: EditMessageOpts) => Promise<boolean>);
} = {}) {
  const calls = {
    sends: [] as Array<{ channelId: string; embed: DiscordEmbedPayload }>,
    edits: [] as Array<{ channelId: string; messageId: string; embed: DiscordEmbedPayload }>,
    replies: [] as Array<{ channelId: string; content: string; replyToMessageId?: string }>,
    messageEdits: [] as EditMessageOpts[],
  };
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const gatewayFactory = async (_cfg: unknown, handlers: GatewayHandlers) => {
    box.handlers = handlers;
    handlers.sendEmbed = async (o) => {
      calls.sends.push(o);
      return { messageId: `sent_${calls.sends.length}` };
    };
    handlers.editEmbed = async (o) => {
      calls.edits.push(o);
      return over.editEmbed ? over.editEmbed(o) : true;
    };
    handlers.reply = async (o) => {
      calls.replies.push(o);
      return over.reply ? over.reply(o) : { messageId: `reply_${calls.replies.length}` };
    };
    const editMessage = over.editMessage;
    if (editMessage) {
      handlers.editMessage = async (o) => {
        calls.messageEdits.push(o);
        return editMessage === true ? true : editMessage(o);
      };
    }
    return createNullGateway();
  };
  return { calls, box, gatewayFactory };
}

async function start(
  db: Database,
  extra: Partial<Parameters<typeof startBridge>[0]> = {},
) {
  const result = await startBridge({
    env: ENV,
    projectRoot: tempProject(),
    db,
    skipProtocolCheck: true,
    disableScheduler: true,
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    agent: createEchoAgentClient(),
    ...extra,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  cleanups.push(() => result.stop());
  return result;
}

describe("schema v9 discord_inflight_replies (REQ-discord-311)", () => {
  test("fresh DB reaches schema 9 with the table", () => {
    const db = memDb();
    // v10 (schedule run runner, REQ-discord-346) builds on v9.
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(9);
    const v = db.query("SELECT value FROM schema_meta WHERE key = 'version'").get() as {
      value: string;
    };
    expect(v.value).toBe(String(SCHEMA_VERSION));
    expect(inflightRows(db)).toEqual([]);
  });

  test("a v8 DB migrates to 9 and keeps existing rows", () => {
    const db = new SqliteDatabase(":memory:");
    cleanups.push(() => db.close());
    migrateCorvidinhoDb(db);
    db.exec("DROP TABLE discord_inflight_replies");
    db.run("UPDATE schema_meta SET value = '8' WHERE key = 'version'");
    db.run(
      "INSERT INTO discord_sessions (id, channel_id, user_id, created_at, last_activity_at) VALUES ('d1','c','u',1,1)",
    );
    migrateCorvidinhoDb(db);
    const v = db.query("SELECT value FROM schema_meta WHERE key = 'version'").get() as {
      value: string;
    };
    expect(v.value).toBe(String(SCHEMA_VERSION));
    expect(inflightRows(db)).toEqual([]);
    expect(
      (db.query("SELECT COUNT(*) AS c FROM discord_sessions").get() as { c: number }).c,
    ).toBe(1);
  });
});

describe("InflightReplyStore", () => {
  test("begin → progress id → list → end; rows survive a reopen", () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-inflight-db-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const path = join(dir, "corvidinho.db");
    const db1 = openCorvidinhoDb({ path });
    let t = 100;
    const s1 = new InflightReplyStore(db1, () => t++);
    const a = s1.begin({ sessionId: "sess_a", channelId: "chan-1", requestMessageId: "m1" });
    const b = s1.begin({
      sessionId: "sess_b",
      channelId: "thread-9",
      parentChannelId: "chan-1",
      requestMessageId: "m2",
    });
    expect(a.progressMessageId).toBeNull();
    s1.setProgressMessage(a.id, "progress_a");
    db1.close();

    const db2 = openCorvidinhoDb({ path });
    cleanups.push(() => db2.close());
    const s2 = new InflightReplyStore(db2);
    expect(s2.list()).toEqual([
      {
        id: a.id,
        sessionId: "sess_a",
        channelId: "chan-1",
        parentChannelId: null,
        progressMessageId: "progress_a",
        requestMessageId: "m1",
        startedAt: 100,
      },
      {
        id: b.id,
        sessionId: "sess_b",
        channelId: "thread-9",
        parentChannelId: "chan-1",
        progressMessageId: null,
        requestMessageId: "m2",
        startedAt: 101,
      },
    ]);
    s2.end(a.id);
    expect(s2.list().map((r) => r.id)).toEqual([b.id]);
  });
});

describe("bridge records in-flight replies and clears them on every exit", () => {
  test("success: row exists (with the progress embed id) while the agent runs, gone after", async () => {
    const db = memDb();
    const outbound = memoryThinkingOutbound();
    const seen: Array<Array<Record<string, unknown>>> = [];
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        seen.push(inflightRows(db));
        return { ok: true, sessionId, summary: "done", exitCode: 0 };
      },
    };
    const { box, gatewayFactory } = fakeDiscord();
    const r = await start(db, { agent, thinkingOutbound: outbound, gatewayFactory });
    await box.handlers!.onMessage(mention("m1"));

    expect(seen).toHaveLength(1);
    expect(seen[0]).toHaveLength(1);
    const row = seen[0]![0]!;
    expect(row.channel_id).toBe("chan-1");
    expect(row.request_message_id).toBe("m1");
    expect(row.progress_message_id).toBe(outbound.sends[0]!.messageId);
    expect(r.store.get(row.session_id as string)).toBeDefined();
    expect(inflightRows(db)).toEqual([]);
  });

  test("thread message: row targets the thread and keeps the allowlisted parent", async () => {
    const db = memDb();
    const seen: Array<Array<Record<string, unknown>>> = [];
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        seen.push(inflightRows(db));
        return { ok: true, sessionId, summary: "done", exitCode: 0 };
      },
    };
    const { box, gatewayFactory } = fakeDiscord();
    await start(db, { agent, gatewayFactory });
    await box.handlers!.onMessage({ ...mention("m1t"), threadId: "thread-1" });
    expect(seen[0]).toHaveLength(1);
    expect(seen[0]![0]!.channel_id).toBe("thread-1");
    expect(seen[0]![0]!.parent_channel_id).toBe("chan-1");
    expect(inflightRows(db)).toEqual([]);
  });

  test("failed run (non-zero exit): row cleared", async () => {
    const db = memDb();
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        expect(inflightRows(db)).toHaveLength(1);
        return { ok: false, sessionId, summary: "boom", exitCode: 7 };
      },
    };
    const { box, gatewayFactory } = fakeDiscord();
    await start(db, { agent, gatewayFactory });
    await box.handlers!.onMessage(mention("m2"));
    expect(inflightRows(db)).toEqual([]);
  });

  test("run stops to ask a human: row cleared", async () => {
    const db = memDb();
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        expect(inflightRows(db)).toHaveLength(1);
        return {
          ok: true,
          sessionId,
          summary: "need input",
          exitCode: 0,
          ask: { reason: "clarify", question: "Which branch?" },
        };
      },
    };
    const { box, calls, gatewayFactory } = fakeDiscord();
    await start(db, { agent, gatewayFactory });
    await box.handlers!.onMessage(mention("m2b"));
    expect(calls.replies.at(-1)?.content).toContain("Which branch?");
    expect(inflightRows(db)).toEqual([]);
  });

  test("agent throws: error propagates, row cleared", async () => {
    const db = memDb();
    const agent: AgentClient = {
      async runChat() {
        expect(inflightRows(db)).toHaveLength(1);
        throw new Error("spawn failed");
      },
    };
    const { box, gatewayFactory } = fakeDiscord();
    await start(db, { agent, gatewayFactory });
    await expect(box.handlers!.onMessage(mention("m3"))).rejects.toThrow("spawn failed");
    expect(inflightRows(db)).toEqual([]);
  });

  test("worktree refused: row cleared", async () => {
    const db = memDb();
    let ran = false;
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        ran = true;
        return { ok: true, sessionId, summary: "x", exitCode: 0 };
      },
    };
    const { box, calls, gatewayFactory } = fakeDiscord();
    // Project root that does not exist: bindWorktree refuses.
    await start(db, {
      agent,
      gatewayFactory,
      projectRoot: join(tempProject(), "missing"),
    });
    await box.handlers!.onMessage(mention("m4"));
    expect(ran).toBe(false);
    expect(calls.replies.at(-1)?.content).toContain("Could not isolate worktree");
    expect(inflightRows(db)).toEqual([]);
  });

  test("button pick (DISCORD-ASK, no editMessage): row kept while the resumed run works, cleared after", async () => {
    const db = memDb();
    const ask: HumanAsk = {
      reason: "clarify",
      question: "Which DB?",
      options: [
        { id: "1", label: "Postgres" },
        { id: "2", label: "SQLite" },
      ],
    };
    let n = 0;
    const seen: Array<Array<Record<string, unknown>>> = [];
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        n += 1;
        if (n === 1) {
          return { ok: true, sessionId, summary: "need input", exitCode: 0, ask };
        }
        seen.push(inflightRows(db));
        return { ok: true, sessionId, summary: "Using Postgres", exitCode: 0 };
      },
    };
    const { box, calls, gatewayFactory } = fakeDiscord();
    const r = await start(db, { agent, gatewayFactory });
    await box.handlers!.onMessage(mention("m7"));
    expect(inflightRows(db)).toEqual([]);
    const session = r.store.list()[0]!;
    const pending = session.pendingAsk!;
    expect(pending.stubMessageId).toBe("reply_1");

    await box.handlers!.onComponent!({
      id: "ix-pick",
      customId: pickCustomId(pending.askId!, "1"),
      channelId: "chan-1",
      userId: "u1",
      messageId: "reply_1",
      reply: async () => {},
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toHaveLength(1);
    const row = seen[0]![0]!;
    expect(row.channel_id).toBe("chan-1");
    expect(row.request_message_id).toBe("reply_1");
    // DISCORD-ASK-7: the Choose stub is reused as the progress surface.
    expect(row.progress_message_id).toBe("reply_1");
    expect(calls.sends).toHaveLength(1);
    expect(calls.replies.at(-1)?.content).toContain("Using Postgres");
    expect(inflightRows(db)).toEqual([]);
  });

  test("ignored / refused messages never record a row", async () => {
    const db = memDb();
    const { box, calls, gatewayFactory } = fakeDiscord();
    await start(db, { gatewayFactory });
    await box.handlers!.onMessage({ ...mention("m5"), channelId: "not-allowed" });
    await box.handlers!.onMessage({ ...mention("m6"), authorBot: true });
    expect(inflightRows(db)).toEqual([]);
    expect(calls.sends).toHaveLength(0);
  });
});

describe("DISCORD-ASK-6/7 collapsed replies clear the in-flight row (REQ-discord-311)", () => {
  const buttonAsk: HumanAsk = {
    reason: "clarify",
    question: "Which DB?",
    options: [
      { id: "1", label: "Postgres" },
      { id: "2", label: "SQLite" },
    ],
  };

  test("mention answer collapsed into the progress message: row present during the edit, deleted once it lands, no extra reply", async () => {
    const db = memDb();
    const rowsAtCollapse: number[] = [];
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        expect(inflightRows(db)).toHaveLength(1);
        return { ok: true, sessionId, summary: "all done", exitCode: 0 };
      },
    };
    const { box, calls, gatewayFactory } = fakeDiscord({
      editMessage: async () => {
        rowsAtCollapse.push(inflightRows(db).length);
        return true;
      },
    });
    const r = await start(db, { agent, gatewayFactory });
    await box.handlers!.onMessage(mention("c1"));

    expect(calls.sends).toHaveLength(1);
    expect(calls.messageEdits).toHaveLength(1);
    const edit = calls.messageEdits[0]!;
    expect(edit.messageId).toBe("sent_1");
    expect(edit.content).toBe("all done");
    // DISCORD-3.a — the answer keeps a footer-only embed (model).
    expect(edit.embed).toStrictEqual({
      color: THINKING_COLORS.success,
      footer: { text: loadLlmEnv(process.env).model },
    });
    expect(calls.replies).toHaveLength(0);
    expect(rowsAtCollapse).toEqual([1]);
    expect(inflightRows(db)).toEqual([]);
    expect(r.store.list()[0]).toBeDefined();
  });

  test("failed run collapsed into the progress message: row deleted", async () => {
    const db = memDb();
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ok: false, sessionId, summary: "boom", exitCode: 3 };
      },
    };
    const { box, calls, gatewayFactory } = fakeDiscord({ editMessage: true });
    await start(db, { agent, gatewayFactory });
    await box.handlers!.onMessage(mention("c2"));
    expect(calls.messageEdits.at(-1)?.content).toContain("failed (exit 3)");
    expect(calls.replies).toHaveLength(0);
    expect(inflightRows(db)).toEqual([]);
  });

  test("button ask collapsed into the Choose stub: row deleted, stub id is the progress message", async () => {
    const db = memDb();
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ok: true, sessionId, summary: "need input", exitCode: 0, ask: buttonAsk };
      },
    };
    const { box, calls, gatewayFactory } = fakeDiscord({ editMessage: true });
    const r = await start(db, { agent, gatewayFactory });
    await box.handlers!.onMessage(mention("c3"));
    const edit = calls.messageEdits.at(-1)!;
    expect(edit.messageId).toBe("sent_1");
    expect(edit.components?.length).toBeGreaterThan(0);
    // Only the requester ping follows the collapsed stub (REQ-discord-215).
    expect(calls.replies).toHaveLength(1);
    expect(calls.replies[0]!.content).toBe("<@u1> ↑ question for you");
    expect(r.store.list()[0]!.pendingAsk?.stubMessageId).toBe("sent_1");
    expect(inflightRows(db)).toEqual([]);
  });

  test("button pick: the stub is the progress message and is collapsed into the answer; row deleted", async () => {
    const db = memDb();
    let n = 0;
    const seen: Array<Array<Record<string, unknown>>> = [];
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        n += 1;
        if (n === 1) {
          return { ok: true, sessionId, summary: "need input", exitCode: 0, ask: buttonAsk };
        }
        seen.push(inflightRows(db));
        return { ok: true, sessionId, summary: "Using Postgres", exitCode: 0 };
      },
    };
    const { box, calls, gatewayFactory } = fakeDiscord({ editMessage: true });
    const r = await start(db, { agent, gatewayFactory });
    await box.handlers!.onMessage(mention("c4"));
    const pending = r.store.list()[0]!.pendingAsk!;
    expect(pending.stubMessageId).toBe("sent_1");

    await box.handlers!.onComponent!({
      id: "ix-pick-c4",
      customId: pickCustomId(pending.askId!, "1"),
      channelId: "chan-1",
      userId: "u1",
      messageId: "sent_1",
      reply: async () => {},
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toHaveLength(1);
    expect(seen[0]![0]!.request_message_id).toBe("sent_1");
    expect(seen[0]![0]!.progress_message_id).toBe("sent_1");
    // One public message the whole way: no second embed; the only reply is
    // the requester ping after the stub was posted (REQ-discord-215).
    expect(calls.sends).toHaveLength(1);
    expect(calls.replies).toHaveLength(1);
    expect(calls.replies[0]!.content).toBe("<@u1> ↑ question for you");
    const last = calls.messageEdits.at(-1)!;
    expect(last.messageId).toBe("sent_1");
    expect(last.content).toBe("Using Postgres");
    expect(inflightRows(db)).toEqual([]);
  });

  test("collapse edit refused: fallback reply is posted while the row is still present, then the row is deleted", async () => {
    const db = memDb();
    const rowsAtReply: number[] = [];
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ok: true, sessionId, summary: "fallback answer", exitCode: 0 };
      },
    };
    const { box, calls, gatewayFactory } = fakeDiscord({
      editMessage: async () => false,
      reply: async () => {
        rowsAtReply.push(inflightRows(db).length);
        return { messageId: "fallback_reply" };
      },
    });
    await start(db, { agent, gatewayFactory });
    await box.handlers!.onMessage(mention("c5"));
    expect(calls.messageEdits).toHaveLength(1);
    expect(calls.replies.map((x) => x.content)).toEqual(["fallback answer"]);
    expect(rowsAtReply).toEqual([1]);
    expect(inflightRows(db)).toEqual([]);
  });

  test("collapse edit throws: error propagates, row deleted", async () => {
    const db = memDb();
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ok: true, sessionId, summary: "x", exitCode: 0 };
      },
    };
    const { box, gatewayFactory } = fakeDiscord({
      editMessage: async () => {
        throw new Error("edit exploded");
      },
    });
    await start(db, { agent, gatewayFactory });
    await expect(box.handlers!.onMessage(mention("c6"))).rejects.toThrow("edit exploded");
    expect(inflightRows(db)).toEqual([]);
  });

  test("dry path (no editMessage, no reply surface): thinking disposed, row deleted", async () => {
    const db = memDb();
    const sends: string[] = [];
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        expect(inflightRows(db)).toHaveLength(1);
        return { ok: true, sessionId, summary: "dry", exitCode: 0 };
      },
    };
    const box: { handlers: GatewayHandlers | null } = { handlers: null };
    await start(db, {
      agent,
      // Exposes the handlers but wires no reply/embed surface (dry bridge).
      gatewayFactory: async (_cfg: unknown, handlers: GatewayHandlers) => {
        box.handlers = handlers;
        return createNullGateway();
      },
      thinkingOutbound: {
        async sendEmbed() {
          sends.push("s");
          return { messageId: "dry_progress" };
        },
        async editEmbed() {
          return true;
        },
      },
    });
    await box.handlers!.onMessage(mention("c7"));
    expect(sends).toHaveLength(1);
    expect(inflightRows(db)).toEqual([]);
  });
});

describe("bridge start recovers replies a dead process left (REQ-discord-311)", () => {
  test("crash mid-reply: the next start edits the frozen embed to failed/interrupted and deletes the row", async () => {
    const db = memDb();
    // Bridge A: the agent never finishes (the process "dies" mid-reply).
    let release: () => void = () => {};
    const hanging: AgentClient = {
      runChat: ({ sessionId }) =>
        new Promise((resolve) => {
          release = () => resolve({ ok: false, sessionId, summary: "", exitCode: 1 });
        }),
    };
    const a = fakeDiscord();
    await start(db, { agent: hanging, gatewayFactory: a.gatewayFactory });
    const pending = a.box.handlers!.onMessage(mention("req-1"));
    for (let i = 0; i < 50 && inflightRows(db)[0]?.progress_message_id == null; i++) {
      await Bun.sleep(5);
    }
    const [row] = inflightRows(db);
    expect(row?.progress_message_id).toBe("sent_1");
    expect(a.calls.edits).toHaveLength(0);

    // Bridge B starts on the same DB with a fresh Discord client.
    const b = fakeDiscord();
    await start(db, { gatewayFactory: b.gatewayFactory });
    expect(b.calls.edits).toHaveLength(1);
    const edit = b.calls.edits[0]!;
    expect(edit.channelId).toBe("chan-1");
    expect(edit.messageId).toBe("sent_1");
    expect(edit.embed.color).toBe(THINKING_COLORS.error);
    expect(edit.embed.description).toBe(INTERRUPTED_REPLY_STATUS);
    expect(edit.embed.description).toContain(
      "interrupted: Corvidinho restarted before this reply finished — please send it again",
    );
    expect(edit.embed.footer?.text).toContain("error");
    expect(b.calls.replies).toHaveLength(0);
    expect(b.calls.sends).toHaveLength(0);
    expect(inflightRows(db)).toEqual([]);

    release();
    await pending;
  });

  test("a reply collapsed into its answer before the restart leaves nothing to recover", async () => {
    const db = memDb();
    const a = fakeDiscord({ editMessage: true });
    await start(db, { gatewayFactory: a.gatewayFactory });
    await a.box.handlers!.onMessage(mention("req-c"));
    expect(a.calls.messageEdits.at(-1)?.messageId).toBe("sent_1");
    expect(inflightRows(db)).toEqual([]);

    const b = fakeDiscord({ editMessage: true });
    await start(db, { gatewayFactory: b.gatewayFactory });
    expect(b.calls.edits).toHaveLength(0);
    expect(b.calls.messageEdits).toHaveLength(0);
    expect(b.calls.replies).toHaveLength(0);
    expect(b.calls.sends).toHaveLength(0);
  });

  test("crash during a button pick: the Choose stub reused as progress is marked interrupted", async () => {
    const db = memDb();
    let n = 0;
    let release: () => void = () => {};
    const agent: AgentClient = {
      runChat: ({ sessionId }) => {
        n += 1;
        if (n === 1) {
          return Promise.resolve({
            ok: true,
            sessionId,
            summary: "need input",
            exitCode: 0,
            ask: {
              reason: "clarify",
              question: "Which DB?",
              options: [
                { id: "1", label: "Postgres" },
                { id: "2", label: "SQLite" },
              ],
            },
          });
        }
        return new Promise((resolve) => {
          release = () => resolve({ ok: false, sessionId, summary: "", exitCode: 1 });
        });
      },
    };
    const a = fakeDiscord({ editMessage: true });
    const ra = await start(db, { agent, gatewayFactory: a.gatewayFactory });
    await a.box.handlers!.onMessage(mention("req-p"));
    const pending = ra.store.list()[0]!.pendingAsk!;
    expect(pending.stubMessageId).toBe("sent_1");
    const pick = a.box.handlers!.onComponent!({
      id: "ix-crash",
      customId: pickCustomId(pending.askId!, "1"),
      channelId: "chan-1",
      userId: "u1",
      messageId: "sent_1",
      reply: async () => {},
    });
    for (let i = 0; i < 50 && inflightRows(db)[0]?.progress_message_id == null; i++) {
      await Bun.sleep(5);
    }
    const [row] = inflightRows(db);
    expect(row?.progress_message_id).toBe("sent_1");
    expect(row?.request_message_id).toBe("sent_1");

    const b = fakeDiscord({ editMessage: true });
    await start(db, { gatewayFactory: b.gatewayFactory });
    expect(b.calls.edits.map((e) => [e.messageId, e.embed.description])).toEqual([
      ["sent_1", INTERRUPTED_REPLY_STATUS],
    ]);
    expect(b.calls.edits[0]!.embed.color).toBe(THINKING_COLORS.error);
    expect(b.calls.replies).toHaveLength(0);
    expect(inflightRows(db)).toEqual([]);

    release();
    await pick;
  });

  test("a failed edit falls back to a reply to the request message", async () => {
    const db = memDb();
    const store = new InflightReplyStore(db);
    const row = store.begin({
      sessionId: "sess_x",
      channelId: "thread-7",
      parentChannelId: "chan-1",
      requestMessageId: "req-2",
    });
    store.setProgressMessage(row.id, "progress_gone");
    const { calls, gatewayFactory } = fakeDiscord({ editEmbed: async () => false });
    await start(db, { gatewayFactory });
    expect(calls.edits.map((e) => e.messageId)).toEqual(["progress_gone"]);
    expect(calls.replies).toEqual([
      { channelId: "thread-7", content: INTERRUPTED_REPLY_STATUS, replyToMessageId: "req-2" },
    ]);
    expect(inflightRows(db)).toEqual([]);
  });

  test("no progress embed yet: replies to the request message", async () => {
    const db = memDb();
    new InflightReplyStore(db).begin({ sessionId: "s", channelId: "chan-1", requestMessageId: "req-3" });
    const { calls, gatewayFactory } = fakeDiscord();
    await start(db, { gatewayFactory });
    expect(calls.edits).toHaveLength(0);
    expect(calls.replies).toEqual([
      { channelId: "chan-1", content: INTERRUPTED_REPLY_STATUS, replyToMessageId: "req-3" },
    ]);
    expect(inflightRows(db)).toEqual([]);
  });

  test("edit and reply both throw: startup still succeeds and the row is deleted", async () => {
    const db = memDb();
    const store = new InflightReplyStore(db);
    const row = store.begin({ sessionId: "s", channelId: "chan-1", requestMessageId: "req-4" });
    store.setProgressMessage(row.id, "p4");
    const { calls, gatewayFactory } = fakeDiscord({
      editEmbed: async () => {
        throw new Error("discord down");
      },
      reply: async () => {
        throw new Error("discord down");
      },
    });
    await start(db, { gatewayFactory });
    expect(calls.edits).toHaveLength(1);
    expect(calls.replies).toHaveLength(1);
    expect(inflightRows(db)).toEqual([]);
  });

  test("channel no longer allowlisted (DISCORD-5): nothing edited or posted, row deleted", async () => {
    const db = memDb();
    const store = new InflightReplyStore(db);
    const gone = store.begin({ sessionId: "s", channelId: "chan-old", requestMessageId: "req-5" });
    store.setProgressMessage(gone.id, "p5");
    store.begin({
      sessionId: "s",
      channelId: "thread-old",
      parentChannelId: "chan-old",
      requestMessageId: "req-6",
    });
    const { calls, gatewayFactory } = fakeDiscord();
    await start(db, { gatewayFactory });
    expect(calls.edits).toHaveLength(0);
    expect(calls.replies).toHaveLength(0);
    expect(calls.sends).toHaveLength(0);
    expect(inflightRows(db)).toEqual([]);
  });

  test("thread row whose parent channel is allowlisted is recovered in the thread", async () => {
    const db = memDb();
    const store = new InflightReplyStore(db);
    const row = store.begin({
      sessionId: "s",
      channelId: "thread-2",
      parentChannelId: "chan-1",
      requestMessageId: "req-7",
    });
    store.setProgressMessage(row.id, "p7");
    const { calls, gatewayFactory } = fakeDiscord();
    await start(db, { gatewayFactory });
    expect(calls.edits.map((e) => [e.channelId, e.messageId])).toEqual([["thread-2", "p7"]]);
    expect(calls.replies).toHaveLength(0);
    expect(inflightRows(db)).toEqual([]);
  });

  test("no rows: nothing is posted or edited at startup", async () => {
    const db = memDb();
    const { calls, gatewayFactory } = fakeDiscord();
    await start(db, { gatewayFactory });
    expect(calls.sends).toHaveLength(0);
    expect(calls.edits).toHaveLength(0);
    expect(calls.replies).toHaveLength(0);
  });
});

describe("recoverInterruptedReplies", () => {
  test("one Discord call at a time, oldest first; counts outcomes", async () => {
    const db = memDb();
    let t = 1;
    const store = new InflightReplyStore(db, () => t++);
    const r1 = store.begin({ sessionId: "s1", channelId: "c1", requestMessageId: "q1" });
    store.setProgressMessage(r1.id, "p1");
    const r2 = store.begin({ sessionId: "s2", channelId: "c2", requestMessageId: "q2" });
    store.setProgressMessage(r2.id, "p2");
    store.begin({ sessionId: "s3", channelId: "c3", requestMessageId: "q3" });

    let active = 0;
    let maxActive = 0;
    const order: string[] = [];
    const slow = async <T>(label: string, value: T): Promise<T> => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      order.push(label);
      await Bun.sleep(5);
      active -= 1;
      return value;
    };
    const result = await recoverInterruptedReplies({
      store,
      rows: store.list(),
      editEmbed: (o) => slow(`edit:${o.messageId}`, o.messageId === "p1"),
      reply: (o) => slow(`reply:${o.replyToMessageId}`, o.replyToMessageId === "q3" ? null : { messageId: "r" }),
    });
    expect(order).toEqual(["edit:p1", "edit:p2", "reply:q2", "reply:q3"]);
    expect(maxActive).toBe(1);
    expect(result).toEqual({ edited: 1, replied: 1, failed: 1, skipped: 0 });
    expect(store.list()).toEqual([]);
  });

  test("mayPost false or throwing skips the row without any Discord call", async () => {
    const db = memDb();
    const store = new InflightReplyStore(db);
    const a = store.begin({ sessionId: "s1", channelId: "c1", requestMessageId: "q1" });
    store.setProgressMessage(a.id, "p1");
    store.begin({ sessionId: "s2", channelId: "c2", requestMessageId: "q2" });
    let discordCalls = 0;
    const result = await recoverInterruptedReplies({
      store,
      rows: store.list(),
      mayPost: (row) => {
        if (row.channelId === "c2") throw new Error("allowlist unreadable");
        return false;
      },
      editEmbed: async () => {
        discordCalls += 1;
        return true;
      },
      reply: async () => {
        discordCalls += 1;
        return { messageId: "r" };
      },
    });
    expect(discordCalls).toBe(0);
    expect(result).toEqual({ edited: 0, replied: 0, failed: 0, skipped: 2 });
    expect(store.list()).toEqual([]);
  });
});

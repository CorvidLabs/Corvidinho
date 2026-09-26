/**
 * In-flight replies + restart recovery (REQ-discord-311, DISCORD-3 / AGENT-3).
 * A bridge that dies mid-reply leaves its progress embed at "working…"; the
 * next start marks it interrupted (or replies) and forgets the row.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import { Database as SqliteDatabase } from "bun:sqlite";
import type { AgentClient } from "../src/discord/agent-client.ts";
import { createEchoAgentClient } from "../src/discord/agent-client.ts";
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

/** Fake live Discord surface: records every send/edit/reply. */
function fakeDiscord(over: {
  editEmbed?: GatewayHandlers["editEmbed"];
  reply?: GatewayHandlers["reply"];
} = {}) {
  const calls = {
    sends: [] as Array<{ channelId: string; embed: DiscordEmbedPayload }>,
    edits: [] as Array<{ channelId: string; messageId: string; embed: DiscordEmbedPayload }>,
    replies: [] as Array<{ channelId: string; content: string; replyToMessageId?: string }>,
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
    expect(SCHEMA_VERSION).toBe(9);
    const v = db.query("SELECT value FROM schema_meta WHERE key = 'version'").get() as {
      value: string;
    };
    expect(v.value).toBe("9");
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
    const b = s1.begin({ sessionId: "sess_b", channelId: "thread-9", requestMessageId: "m2" });
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
        progressMessageId: "progress_a",
        requestMessageId: "m1",
        startedAt: 100,
      },
      {
        id: b.id,
        sessionId: "sess_b",
        channelId: "thread-9",
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

  test("a failed edit falls back to a reply to the request message", async () => {
    const db = memDb();
    const store = new InflightReplyStore(db);
    const row = store.begin({ sessionId: "sess_x", channelId: "thread-7", requestMessageId: "req-2" });
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
    expect(result).toEqual({ edited: 1, replied: 1, failed: 1 });
    expect(store.list()).toEqual([]);
  });
});

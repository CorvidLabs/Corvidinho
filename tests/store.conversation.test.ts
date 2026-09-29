/**
 * AGENT-6.a / SESSION-6 (REQ-discord-472, REQ-watch-472) — retained
 * conversations: schema v12 `conversation_threads` (forward-only migration),
 * each thread's condensed summary and last turns kept scrubbed for 30 days
 * after its last update and then purged, and the per-person delete the
 * forget-me flow (MEMORY-ACL-6) calls. Temp / in-memory DBs only.
 */
import { Database as SqliteDatabase } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { SessionStore } from "../src/discord/session-store.ts";
import {
  CONVERSATION_KEEP_BOT_MESSAGES,
  CONVERSATION_KEEP_TURNS,
  CONVERSATION_RETENTION_MS,
  type ConversationTurn,
  ConversationStore,
  discordParticipant,
  discordThreadKey,
  forgetConversations,
  githubParticipant,
  watchThreadKey,
} from "../src/store/conversation.ts";
import { migrateCorvidinhoDb, openCorvidinhoDb, SCHEMA_VERSION } from "../src/store/db.ts";
import { rescrubDatabase, SCRUB_TARGETS } from "../src/store/scrub.ts";

const TTL_MS = 45 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN = `ghp_${"A1b2C3d4E5".repeat(4)}`;
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

function memDb() {
  const db = openCorvidinhoDb({ memory: true });
  cleanups.push(() => db.close());
  return db;
}

function turns(n: number): ConversationTurn[] {
  const out: ConversationTurn[] = [];
  for (let i = 1; i <= n; i += 1) {
    out.push({ role: i % 2 === 1 ? "human" : "agent", content: `turn number ${i}`, createdAt: i });
  }
  return out;
}

function tableCount(db: SqliteDatabase): number {
  return (db.query("SELECT COUNT(*) AS n FROM conversation_threads").get() as { n: number }).n;
}

describe("schema v12 conversation_threads (forward-only migration)", () => {
  test("a v11 DB migrates to v12, keeps its rows, and a re-run changes nothing", () => {
    expect(SCHEMA_VERSION).toBe(12);
    const db = new SqliteDatabase(":memory:");
    cleanups.push(() => db.close());
    migrateCorvidinhoDb(db);
    // Back to v11 with a live session row from before the upgrade.
    db.exec("DROP TABLE conversation_threads");
    db.run("UPDATE schema_meta SET value = '11' WHERE key = 'version'");
    db.run(
      `INSERT INTO discord_sessions (id, channel_id, user_id, created_at, last_activity_at)
       VALUES ('sess_old', 'c', 'u1', 1, 2)`,
    );
    migrateCorvidinhoDb(db);
    const version = () =>
      (db.query("SELECT value FROM schema_meta WHERE key = 'version'").get() as { value: string }).value;
    expect(version()).toBe("12");
    const cols = (db.query("PRAGMA table_info(conversation_threads)").all() as Array<{ name: string }>).map(
      (c) => c.name,
    );
    expect(cols).toEqual([
      "id",
      "surface",
      "thread_key",
      "user_id",
      "session_id",
      "summary",
      "turns",
      "participants",
      "bot_message_ids",
      "updated_at",
    ]);
    expect(db.query("SELECT id FROM discord_sessions").all()).toEqual([{ id: "sess_old" }]);
    new ConversationStore({ db }).save({
      surface: "discord",
      threadKey: "channel:c",
      userId: "u1",
      summary: "",
      turns: turns(2),
    });
    migrateCorvidinhoDb(db);
    expect(version()).toBe("12");
    expect(tableCount(db)).toBe(1);
  });
});

describe("ConversationStore (AGENT-6.a)", () => {
  test("saves scrubbed text, keeps the opening turn and the last turns, folds the rest into the summary", () => {
    const db = memDb();
    const store = new ConversationStore({ db });
    const all = turns(CONVERSATION_KEEP_TURNS + 6);
    all[0] = { role: "human", content: `the task, with ${TOKEN}`, createdAt: 0 };
    const saved = store.save({
      surface: "discord",
      threadKey: discordThreadKey({ channelId: "c" }),
      userId: "u1",
      sessionId: "sess_1",
      summary: `earlier point ${TOKEN}`,
      turns: all,
      participants: [discordParticipant("u1")],
      botMessageIds: Array.from({ length: CONVERSATION_KEEP_BOT_MESSAGES + 5 }, (_, i) => `m${i}`),
    });
    expect(saved.turns).toHaveLength(CONVERSATION_KEEP_TURNS);
    expect(saved.turns[0]!.content).toBe("the task, with [redacted:github-token]");
    expect(saved.turns.at(-1)!.content).toBe(`turn number ${all.length}`);
    expect(saved.summary).toContain("earlier point [redacted:github-token]");
    expect(saved.summary).toContain("- You (Corvidinho): turn number 2");
    expect(saved.botMessageIds).toHaveLength(CONVERSATION_KEEP_BOT_MESSAGES);
    expect(saved.botMessageIds.at(-1)).toBe(`m${CONVERSATION_KEEP_BOT_MESSAGES + 4}`);

    const raw = db.query("SELECT summary, turns FROM conversation_threads").get() as {
      summary: string;
      turns: string;
    };
    expect(raw.summary).not.toContain(TOKEN);
    expect(raw.turns).not.toContain(TOKEN);
    expect(store.get(saved.id)).toEqual(saved);
    expect(store.forSession("sess_1")?.id).toBe(saved.id);
    expect(store.byBotMessage(`m${CONVERSATION_KEEP_BOT_MESSAGES + 4}`)?.id).toBe(saved.id);
    expect(store.byBotMessage("m0")).toBeUndefined();
    expect(store.latestForThread("discord", "channel:c", "u1")?.id).toBe(saved.id);
    expect(store.latestForThread("discord", "channel:c", "u2")).toBeUndefined();
  });

  test("kept 30 days after its last update, then purged (and never served past it)", () => {
    const db = memDb();
    let now = 1_000_000_000;
    const store = new ConversationStore({ db, now: () => now });
    const rec = store.save({
      surface: "watch",
      threadKey: watchThreadKey("CorvidLabs/Corvidinho", 7),
      userId: "0xleif",
      summary: "",
      turns: turns(2),
    });
    now += CONVERSATION_RETENTION_MS - 1;
    expect(store.latestForThread("watch", "issue:corvidlabs/corvidinho#7")?.id).toBe(rec.id);
    // An update restarts the 30 days.
    store.save({ ...rec, turns: turns(4) });
    now += CONVERSATION_RETENTION_MS - 1;
    expect(store.get(rec.id)?.turns).toHaveLength(4);
    now += 2;
    expect(store.get(rec.id)).toBeUndefined();
    expect(tableCount(db)).toBe(0);
    expect(CONVERSATION_RETENTION_MS).toBe(30 * DAY_MS);
  });

  test("forgetting a person deletes theirs and every thread holding their words, and nobody else's", () => {
    const db = memDb();
    const store = new ConversationStore({ db });
    const mine = store.save({
      surface: "discord",
      threadKey: "thread:t1",
      userId: "111",
      summary: "",
      turns: turns(2),
      participants: [discordParticipant("111")],
    });
    const theirs = store.save({
      surface: "discord",
      threadKey: "thread:t1",
      userId: "222",
      summary: "",
      turns: turns(2),
      participants: [discordParticipant("222")],
    });
    const myIssue = store.save({
      surface: "watch",
      threadKey: "issue:o/r#1",
      userId: "leif",
      summary: "",
      turns: turns(2),
      participants: [githubParticipant("Leif")],
    });
    const commentedOn = store.save({
      surface: "watch",
      threadKey: "issue:o/r#2",
      userId: "someone",
      summary: "",
      turns: turns(2),
      participants: [githubParticipant("someone"), githubParticipant("leif")],
    });
    const other = store.save({
      surface: "watch",
      threadKey: "issue:o/r#3",
      userId: "someone",
      summary: "",
      turns: turns(2),
      participants: [githubParticipant("someone")],
    });
    expect(store.deleteForPerson({})).toBe(0);
    expect(forgetConversations(db, { discordUserIds: ["111"], githubLogins: ["LEIF"] })).toBe(3);
    expect(store.get(mine.id)).toBeUndefined();
    expect(store.get(myIssue.id)).toBeUndefined();
    expect(store.get(commentedOn.id)).toBeUndefined();
    expect(store.get(theirs.id)?.id).toBe(theirs.id);
    expect(store.get(other.id)?.id).toBe(other.id);
  });

  test("summary and turns are SAFE-6 re-scrub targets", () => {
    expect(SCRUB_TARGETS).toContainEqual({
      table: "conversation_threads",
      columns: ["summary"],
      json: ["turns"],
    });
    const db = memDb();
    db.run(
      `INSERT INTO conversation_threads (id, surface, thread_key, user_id, summary, turns, updated_at)
       VALUES ('conv_raw', 'discord', 'channel:c', 'u1', ?, ?, ?)`,
      [`raw ${TOKEN}`, JSON.stringify([{ role: "human", content: `raw ${TOKEN}`, createdAt: 1 }]), Date.now()],
    );
    const r = rescrubDatabase(db);
    expect(r.byTable.conversation_threads).toBe(1);
    const row = db.query("SELECT summary, turns FROM conversation_threads").get() as {
      summary: string;
      turns: string;
    };
    expect(row.summary).toBe("raw [redacted:github-token]");
    expect(row.turns).not.toContain(TOKEN);
    expect(row.turns).toContain("[redacted:github-token]");
  });
});

describe("SessionStore keeps a conversation past its session (AGENT-6.a / MEMORY-ACL-6)", () => {
  test("a session that idles out or ends leaves its summary, turns and answer ids for 30 days", async () => {
    const db = memDb();
    let now = 5_000_000;
    const store = new SessionStore({ db, ttlMs: TTL_MS, now: () => now });
    const idle = store.create({ channelId: "c", userId: "u1" });
    store.recordTurn(idle, "human", "idle request");
    store.recordTurn(idle, "agent", "idle answer");
    store.trackBotMessage("bot-1", idle);
    const ended = store.create({ channelId: "c", userId: "u2", threadId: "t9" });
    store.recordTurn(ended, "human", "ended request");
    const silent = store.create({ channelId: "c", userId: "u3" });

    await store.endSession(ended);
    now += TTL_MS + 1;
    expect(store.get(idle.id)).toBeUndefined();
    expect(store.get(silent.id)).toBeUndefined();

    const a = store.retainedForReply("bot-1")!;
    expect(a).toMatchObject({ surface: "discord", threadKey: "channel:c", userId: "u1", sessionId: idle.id });
    expect(a.turns.map((t) => t.content)).toEqual(["idle request", "idle answer"]);
    expect(store.retainedForThread("t9", "u2")?.turns.map((t) => t.content)).toEqual(["ended request"]);
    expect(store.retainedForThread("t9", "u1")).toBeUndefined();
    // Nothing said, nothing kept.
    expect(tableCount(db)).toBe(2);

    now += CONVERSATION_RETENTION_MS + 1;
    expect(store.purgeExpiredConversations()).toBe(2);
    expect(store.retainedForReply("bot-1")).toBeUndefined();
  });

  test("forgetConversations clears my live thread and summary and my retained ones, never another user's", () => {
    const db = memDb();
    let now = 5_000_000;
    const store = new SessionStore({ db, ttlMs: TTL_MS, now: () => now, contextWindowTokens: 1024 });
    const old = store.create({ channelId: "c", userId: "u1" });
    store.recordTurn(old, "human", "my old request");
    now += TTL_MS + 1;
    expect(store.get(old.id)).toBeUndefined();

    const live = store.create({ channelId: "c", userId: "u1" });
    for (let i = 0; i < 12; i += 1) {
      store.recordTurn(live, "human", `my request ${i} ${"x".repeat(300)}`);
      store.recordTurn(live, "agent", `my answer ${i} ${"y".repeat(300)}`);
    }
    store.threadPrompt(live, "next");
    expect(store.summaryFor(live)).not.toBe("");
    const theirs = store.create({ channelId: "c", userId: "u2" });
    store.recordTurn(theirs, "human", "their request");

    expect(store.forgetConversations("u1")).toBeGreaterThanOrEqual(2);
    expect(store.threadFor(live)).toEqual([]);
    expect(store.summaryFor(live)).toBe("");
    expect(store.get(live.id)).toBe(live);
    expect(
      (db.query("SELECT COUNT(*) AS n FROM discord_session_turns WHERE session_id = ?").get(live.id) as {
        n: number;
      }).n,
    ).toBe(0);
    expect(
      (db.query("SELECT COUNT(*) AS n FROM conversation_threads WHERE user_id = 'u1'").get() as { n: number })
        .n,
    ).toBe(0);
    expect(store.threadFor(theirs).map((t) => t.content)).toEqual(["their request"]);
  });
});

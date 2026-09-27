/**
 * AGENT-6 (REQ-discord-072) — the session thread renderer (fixed budget,
 * opening request and newest turns kept, middle elided with a count marker)
 * and the SessionStore turn store (persisted per session, dropped with the
 * session, bounded, scrubbed on write and covered by the SAFE-6 re-scrub).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { SessionStore } from "../src/discord/session-store.ts";
import {
  answerTurnText,
  formatSessionThread,
  formatSessionThreadOmitted,
  SESSION_THREAD_BUDGET_CHARS,
  SESSION_THREAD_FOOTER,
  SESSION_THREAD_HEADER,
  SESSION_THREAD_MAX_TURNS,
  SESSION_THREAD_TURN_MAX_CHARS,
  type SessionTurn,
  withSessionThread,
} from "../src/discord/session-thread.ts";
import { openCorvidinhoDb, SCHEMA_VERSION } from "../src/store/db.ts";
import { rescrubDatabase, SCRUB_TARGETS } from "../src/store/scrub.ts";

const TTL_MS = 45 * 60 * 1000;
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

function tempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "corvidinho-thread-unit-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, "corvidinho.db");
}

function exchange(n: number, width = 0): SessionTurn[] {
  const pad = width > 0 ? ` ${"x".repeat(width)}` : "";
  return [
    { role: "human", content: `request number ${n}${pad}`, createdAt: n },
    { role: "agent", content: `answer number ${n}${pad}`, createdAt: n },
  ];
}

function turnCount(db: ReturnType<typeof openCorvidinhoDb>, sessionId?: string): number {
  const row = (
    sessionId
      ? db
          .query("SELECT COUNT(*) AS n FROM discord_session_turns WHERE session_id = ?")
          .get(sessionId)
      : db.query("SELECT COUNT(*) AS n FROM discord_session_turns").get()
  ) as { n: number };
  return row.n;
}

describe("session thread block (REQ-discord-072)", () => {
  test("no turns: no block and the prompt is unchanged", () => {
    expect(formatSessionThread([])).toBe("");
    expect(withSessionThread("hello", [])).toBe("hello");
  });

  test("a short thread is replayed whole, oldest first, labelled, ahead of the prompt", () => {
    const turns = [...exchange(1), ...exchange(2)];
    const out = withSessionThread("new message", turns);
    expect(out).toBe(
      [
        SESSION_THREAD_HEADER,
        "Human: request number 1",
        "You (Corvidinho): answer number 1",
        "Human: request number 2",
        "You (Corvidinho): answer number 2",
        SESSION_THREAD_FOOTER,
        "",
        "new message",
      ].join("\n"),
    );
    expect(out).not.toContain("omitted");
  });

  test("a long thread keeps the opening request and newest turns within budget, eliding the middle with a count marker", () => {
    const turns: SessionTurn[] = [];
    for (let n = 1; n <= 60; n += 1) turns.push(...exchange(n, 200));
    const block = formatSessionThread(turns);
    expect(block.length).toBeLessThanOrEqual(SESSION_THREAD_BUDGET_CHARS);
    expect(block.startsWith(SESSION_THREAD_HEADER)).toBe(true);
    expect(block.endsWith(SESSION_THREAD_FOOTER)).toBe(true);

    const lines = block.split("\n");
    // Opening request pinned right after the header.
    expect(lines[1]!.startsWith("Human: request number 1 ")).toBe(true);
    // Then one marker whose count is exactly the turns left out.
    const marker = lines[2]!;
    const kept = lines.length - 4; // header, opening, marker, footer
    expect(marker).toBe(formatSessionThreadOmitted(turns.length - 1 - kept));
    // Then the newest turns, in order, ending with the newest answer.
    expect(lines.at(-2)!.startsWith("You (Corvidinho): answer number 60 ")).toBe(true);
    expect(lines.at(-3)!.startsWith("Human: request number 60 ")).toBe(true);
    expect(block).not.toContain("request number 2 ");
    expect(block).not.toContain("answer number 1 ");
    expect(kept).toBeGreaterThan(4);
  });

  test("one turn is clipped, so a huge message never crowds out the rest", () => {
    const huge = "y".repeat(SESSION_THREAD_TURN_MAX_CHARS * 3);
    const block = formatSessionThread([
      { role: "human", content: huge },
      { role: "agent", content: "short answer" },
    ]);
    expect(block).toContain(`Human: ${"y".repeat(SESSION_THREAD_TURN_MAX_CHARS - 1)}…`);
    expect(block).not.toContain("y".repeat(SESSION_THREAD_TURN_MAX_CHARS));
    expect(block).toContain("You (Corvidinho): short answer");
  });

  test("a button ask is recorded as its question and choices, a spend-cap stop as nothing, anything else as posted", () => {
    expect(answerTurnText("the answer", null)).toBe("the answer");
    expect(answerTurnText("❓ Why?", { reason: "clarify", question: "Why?" })).toBe("❓ Why?");
    expect(
      answerTurnText("❓ I need your input", {
        reason: "clarify",
        question: "Which DB?",
        options: [{ label: "Postgres" }, { label: "SQLite" }],
      }),
    ).toBe("Which DB?\nChoices: Postgres | SQLite");
    // SAFE-8 / REQ-discord-098: no cap text ever reaches a later prompt.
    expect(
      answerTurnText("⏸️ Daily spend cap reached", { reason: "spend-cap", question: "Raise it?" }),
    ).toBe("");
  });
});

describe("SessionStore turns (REQ-discord-072 / SESSION-2/3 / SAFE-6)", () => {
  test("turns table is module-owned: created on open without a schema version change", () => {
    const db = openCorvidinhoDb({ memory: true });
    cleanups.push(() => db.close());
    const has = () =>
      db
        .query("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'discord_session_turns'")
        .get() != null;
    expect(has()).toBe(false);
    new SessionStore({ db, ttlMs: TTL_MS });
    expect(has()).toBe(true);
    const v = db.query("SELECT value FROM schema_meta WHERE key = 'version'").get() as {
      value: string;
    };
    expect(v.value).toBe(String(SCHEMA_VERSION));
    // Idempotent: a second store on the same DB (bridge + daemon share it).
    expect(() => new SessionStore({ db, ttlMs: TTL_MS })).not.toThrow();
  });

  test("turns reload after reopen, oldest first, for their own session only", () => {
    const path = tempDbPath();
    const db1 = openCorvidinhoDb({ path });
    const s1 = new SessionStore({ db: db1, ttlMs: TTL_MS });
    const a = s1.create({ channelId: "c", userId: "u1" });
    const b = s1.create({ channelId: "c", userId: "u2" });
    s1.recordExchange(a, "request number 1", "answer number 1");
    s1.recordExchange(b, "someone else", "their answer");
    s1.recordExchange(a, "request number 2", "answer number 2");
    db1.close();

    const db2 = openCorvidinhoDb({ path });
    cleanups.push(() => db2.close());
    const s2 = new SessionStore({ db: db2, ttlMs: TTL_MS });
    const a2 = s2.get(a.id)!;
    expect(s2.threadFor(a2).map((t) => `${t.role}:${t.content}`)).toEqual([
      "human:request number 1",
      "agent:answer number 1",
      "human:request number 2",
      "agent:answer number 2",
    ]);
    expect(s2.threadFor(s2.get(b.id)!).map((t) => t.content)).toEqual([
      "someone else",
      "their answer",
    ]);
    // A copy: callers cannot edit the stored thread.
    s2.threadFor(a2).pop();
    expect(s2.threadFor(a2)).toHaveLength(4);
  });

  test("ending a session or letting it idle past the TTL drops its turns (SESSION-3)", async () => {
    let now = 1_000_000;
    const db = openCorvidinhoDb({ memory: true });
    cleanups.push(() => db.close());
    const store = new SessionStore({ db, ttlMs: TTL_MS, now: () => now });
    const ended = store.create({ channelId: "c", userId: "u1" });
    const idle = store.create({ channelId: "c", userId: "u2" });
    store.recordExchange(ended, "h", "a");
    store.recordExchange(idle, "h", "a");
    expect(turnCount(db)).toBe(4);

    await store.endSession(ended);
    expect(store.threadFor(ended)).toEqual([]);
    expect(turnCount(db, ended.id)).toBe(0);
    // Recording on an ended session is a no-op (never re-creates its thread).
    store.recordExchange(ended, "late", "late");
    expect(store.threadFor(ended)).toEqual([]);
    expect(turnCount(db, ended.id)).toBe(0);

    now += TTL_MS + 5_000;
    expect(store.get(idle.id)).toBeUndefined();
    expect(store.threadFor(idle)).toEqual([]);
    expect(turnCount(db)).toBe(0);
  });

  test("an expired session's turns are dropped on reload, and orphans are swept", () => {
    let now = 1_000_000;
    const path = tempDbPath();
    const db1 = openCorvidinhoDb({ path });
    const s1 = new SessionStore({ db: db1, ttlMs: TTL_MS, now: () => now });
    const old = s1.create({ channelId: "c", userId: "u1" });
    s1.recordExchange(old, "h", "a");
    const orphan = s1.create({ channelId: "c", userId: "u2" });
    s1.recordExchange(orphan, "h", "a");
    // An earlier build drops a session row without touching its turns.
    db1.exec("PRAGMA foreign_keys = OFF;");
    db1.run("DELETE FROM discord_sessions WHERE id = ?", [orphan.id]);
    expect(turnCount(db1, orphan.id)).toBe(2);
    db1.close();

    now += TTL_MS + 5_000;
    const db2 = openCorvidinhoDb({ path });
    cleanups.push(() => db2.close());
    new SessionStore({ db: db2, ttlMs: TTL_MS, now: () => now });
    expect(turnCount(db2)).toBe(0);
  });

  test("a long session keeps its opening request and the newest turns, bounded", () => {
    const path = tempDbPath();
    const db1 = openCorvidinhoDb({ path });
    const store = new SessionStore({ db: db1, ttlMs: TTL_MS });
    const s = store.create({ channelId: "c", userId: "u1" });
    const exchanges = SESSION_THREAD_MAX_TURNS; // twice the turn cap
    for (let n = 1; n <= exchanges; n += 1) {
      store.recordExchange(s, `request number ${n}`, `answer number ${n}`);
    }
    const thread = store.threadFor(s);
    expect(thread).toHaveLength(SESSION_THREAD_MAX_TURNS);
    expect(thread[0]!.content).toBe("request number 1");
    expect(thread.at(-1)!.content).toBe(`answer number ${exchanges}`);
    expect(turnCount(db1, s.id)).toBe(SESSION_THREAD_MAX_TURNS);
    db1.close();

    const db2 = openCorvidinhoDb({ path });
    cleanups.push(() => db2.close());
    const again = new SessionStore({ db: db2, ttlMs: TTL_MS });
    expect(again.threadFor(again.get(s.id)!).map((t) => t.content)).toEqual(
      thread.map((t) => t.content),
    );
  });

  test("turns are scrubbed on write, and the re-scrub covers the table (SAFE-6)", () => {
    const token = `ghp_${"A1b2C3d4E5".repeat(4)}`;
    const db = openCorvidinhoDb({ memory: true });
    cleanups.push(() => db.close());
    const store = new SessionStore({ db, ttlMs: TTL_MS });
    const s = store.create({ channelId: "c", userId: "u1" });
    store.recordExchange(s, `use ${token}`, `stored ${token}`);
    expect(store.threadFor(s).map((t) => t.content)).toEqual([
      "use [redacted:github-token]",
      "stored [redacted:github-token]",
    ]);
    const rows = db.query("SELECT content FROM discord_session_turns").all() as Array<{
      content: string;
    }>;
    expect(rows.map((r) => r.content)).toEqual([
      "use [redacted:github-token]",
      "stored [redacted:github-token]",
    ]);

    expect(SCRUB_TARGETS).toContainEqual({ table: "discord_session_turns", columns: ["content"] });
    // A row written raw (an earlier rule set) is rewritten by the re-scrub.
    db.run(
      "INSERT INTO discord_session_turns (session_id, role, content, created_at) VALUES (?, 'human', ?, 1)",
      [s.id, `raw ${token}`],
    );
    const r = rescrubDatabase(db);
    expect(r.byTable.discord_session_turns).toBe(1);
    expect(turnCount(db)).toBe(3);
    const raw = db
      .query("SELECT COUNT(*) AS n FROM discord_session_turns WHERE content LIKE ?")
      .get(`%${token}%`) as { n: number };
    expect(raw.n).toBe(0);
  });
});

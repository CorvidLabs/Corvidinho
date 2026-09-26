/**
 * Durable WATCH SessionStore + soft TTL (REQ-watch-037 / REQ-discord-037,
 * SESSION-1..3). Fixture only: temp DB files, no network, no live tokens.
 * Fake secrets are assembled at runtime — never realistic literals in the repo.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyConfig } from "../src/allowlist/types.ts";
import { migrateCorvidinhoDb, openCorvidinhoDb, SCHEMA_VERSION } from "../src/store/db.ts";
import { rescrubDatabase, SCRUB_TARGETS } from "../src/store/scrub.ts";
import { createEchoAgentClient } from "../src/watch/agent-client.ts";
import { startWatchPoller } from "../src/watch/poller.ts";
import { routeEvent } from "../src/watch/router.ts";
import { SessionStore } from "../src/watch/session-store.ts";
import type { DetectedEvent } from "../src/watch/types.ts";
import { Database } from "bun:sqlite";

const TTL = 45 * 60 * 1000;
const FAKE_GH = "gh" + "p_" + "a1B2c3D4e5".repeat(4).slice(0, 36);

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "corvidinho-watch-sess-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function allowCfg() {
  const cfg = emptyConfig();
  cfg.github.orgs = ["corvidlabs"];
  cfg.github.repos = ["corvidlabs/corvidinho"];
  cfg.github.users = ["0xleif"];
  return cfg;
}

function ev(over: Partial<DetectedEvent> = {}): DetectedEvent {
  return {
    id: over.id ?? "comment-1",
    type: over.type ?? "issue_comment",
    body: over.body ?? "@corvid-agent hi",
    sender: over.sender ?? "0xLeif",
    repo: over.repo ?? "CorvidLabs/Corvidinho",
    number: over.number ?? 37,
    title: over.title ?? "SESSION continuity",
    htmlUrl: over.htmlUrl ?? "https://example.com/37",
    createdAt: over.createdAt ?? "2026-09-26T12:00:00Z",
    isPullRequest: over.isPullRequest ?? false,
  };
}

function rowCount(db: Database): number {
  return (db.query("SELECT COUNT(*) AS c FROM watch_sessions").get() as { c: number }).c;
}

describe("schema v6 watch_sessions (REQ-discord-037)", () => {
  test("fresh DB reaches schema 6 with watch_sessions", () => {
    const db = openCorvidinhoDb({ memory: true });
    expect(SCHEMA_VERSION).toBe(6);
    const v = db.query("SELECT value FROM schema_meta WHERE key = 'version'").get() as {
      value: string;
    };
    expect(v.value).toBe("6");
    const t = db
      .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'watch_sessions'")
      .get();
    expect(t).not.toBeNull();
    db.close();
  });

  test("a v5 DB migrates to 6 and keeps existing rows", () => {
    const db = new Database(":memory:");
    migrateCorvidinhoDb(db);
    db.exec("DROP TABLE watch_sessions");
    db.run("UPDATE schema_meta SET value = '5' WHERE key = 'version'");
    db.run(
      "INSERT INTO discord_sessions (id, channel_id, user_id, created_at, last_activity_at) VALUES ('d1','c','u',1,1)",
    );
    migrateCorvidinhoDb(db);
    const v = db.query("SELECT value FROM schema_meta WHERE key = 'version'").get() as {
      value: string;
    };
    expect(v.value).toBe("6");
    expect(rowCount(db)).toBe(0);
    expect(
      (db.query("SELECT COUNT(*) AS c FROM discord_sessions").get() as { c: number }).c,
    ).toBe(1);
    db.close();
  });

  test("watch_sessions.topic is a SAFE-6 scrub target and re-scrubs", () => {
    expect(
      SCRUB_TARGETS.some((t) => t.table === "watch_sessions" && t.columns.includes("topic")),
    ).toBe(true);
    const db = openCorvidinhoDb({ memory: true });
    db.run(
      "INSERT INTO watch_sessions (id, issue_key, repo, number, user_id, topic, created_at, last_activity_at) VALUES ('w1','o/r#1','o/r',1,'u',?,1,1)",
      [`old ${FAKE_GH}`],
    );
    expect(rescrubDatabase(db).byTable.watch_sessions).toBe(1);
    const topic = (db.query("SELECT topic FROM watch_sessions WHERE id = 'w1'").get() as {
      topic: string;
    }).topic;
    expect(topic).toBe("old [redacted:github-token]");
    db.close();
  });
});

describe("durable WATCH SessionStore (REQ-watch-037)", () => {
  test("session survives reopen and continues the same issue", () =>
    withTempDir((dir) => {
      const path = join(dir, "corvidinho.db");
      const db1 = openCorvidinhoDb({ path });
      const store1 = new SessionStore({ db: db1, ttlMs: TTL });
      const s = store1.create({
        repo: "CorvidLabs/Corvidinho",
        number: 37,
        userId: "0xLeif",
        topic: "continuity",
      });
      db1.close();

      const db2 = openCorvidinhoDb({ path });
      const store2 = new SessionStore({ db: db2, ttlMs: TTL });
      expect(store2.durable).toBe(true);
      // Issue key is case-insensitive on repo.
      expect(store2.getByIssue("corvidlabs/corvidinho", 37)?.id).toBe(s.id);
      expect(store2.get(s.id)?.topic).toBe("continuity");
      expect(store2.list().map((x) => x.id)).toEqual([s.id]);

      const action = routeEvent(ev({ id: "c-after-restart" }), {
        store: store2,
        allowlist: allowCfg(),
      });
      expect(action.kind).toBe("continue_session");
      if (action.kind === "continue_session") expect(action.session.id).toBe(s.id);
      db2.close();
    }));

  test("activity within TTL keeps the session; idle past TTL starts fresh", () => {
    let now = 1_000_000;
    const db = openCorvidinhoDb({ memory: true });
    const store = new SessionStore({ db, ttlMs: TTL, now: () => now });
    const deps = { store, allowlist: allowCfg() };

    const a1 = routeEvent(ev({ id: "c1" }), deps);
    expect(a1.kind).toBe("start_session");
    if (a1.kind !== "start_session") return;
    const first = a1.session;

    // Keep-alive: each event inside the TTL touches and continues.
    now += TTL - 1_000;
    const a2 = routeEvent(ev({ id: "c2" }), deps);
    expect(a2.kind).toBe("continue_session");
    now += TTL - 1_000;
    const a3 = routeEvent(ev({ id: "c3" }), deps);
    expect(a3.kind).toBe("continue_session");
    if (a3.kind === "continue_session") expect(a3.session.id).toBe(first.id);
    const persisted = db
      .query("SELECT last_activity_at FROM watch_sessions WHERE id = ?")
      .get(first.id) as { last_activity_at: number };
    expect(persisted.last_activity_at).toBe(now);

    // Idle past TTL: old session purged (memory + DB) and a new one starts.
    now += TTL + 5_000;
    expect(store.getByIssue("CorvidLabs/Corvidinho", 37)).toBeUndefined();
    expect(store.get(first.id)).toBeUndefined();
    expect(rowCount(db)).toBe(0);
    const a4 = routeEvent(ev({ id: "c4" }), deps);
    expect(a4.kind).toBe("start_session");
    if (a4.kind === "start_session") expect(a4.session.id).not.toBe(first.id);
    expect(rowCount(db)).toBe(1);
    db.close();
  });

  test("expired rows are dropped on load", () =>
    withTempDir((dir) => {
      const path = join(dir, "corvidinho.db");
      let now = 5_000_000;
      const db1 = openCorvidinhoDb({ path });
      const store1 = new SessionStore({ db: db1, ttlMs: TTL, now: () => now });
      const stale = store1.create({ repo: "o/r", number: 1, userId: "u" });
      now += TTL; // exactly at TTL is still live
      const live = store1.create({ repo: "o/r", number: 2, userId: "u" });
      db1.close();

      now += 10_000; // stale is now idle past TTL; live is not
      const db2 = openCorvidinhoDb({ path });
      const store2 = new SessionStore({ db: db2, ttlMs: TTL, now: () => now });
      expect(store2.get(stale.id)).toBeUndefined();
      expect(store2.getByIssue("o/r", 2)?.id).toBe(live.id);
      const ids = (db2.query("SELECT id FROM watch_sessions").all() as Array<{ id: string }>).map(
        (r) => r.id,
      );
      expect(ids).toEqual([live.id]);
      db2.close();
    }));

  test("one session per issue key: create supersedes the prior session", () => {
    const db = openCorvidinhoDb({ memory: true });
    const store = new SessionStore({ db, ttlMs: TTL });
    const s1 = store.create({ repo: "O/R", number: 9, userId: "u" });
    const s2 = store.create({ repo: "o/r", number: 9, userId: "u" });
    expect(store.get(s1.id)).toBeUndefined();
    expect(store.getByIssue("O/R", 9)?.id).toBe(s2.id);
    expect(store.list()).toHaveLength(1);
    expect(rowCount(db)).toBe(1);
    // Touching the superseded session never resurrects it.
    store.touch(s1);
    expect(store.get(s1.id)).toBeUndefined();
    expect(rowCount(db)).toBe(1);
    db.close();
  });

  test("stored topic is SAFE-6 scrubbed", () => {
    const db = openCorvidinhoDb({ memory: true });
    const store = new SessionStore({ db, ttlMs: TTL });
    const s = store.create({
      repo: "o/r",
      number: 3,
      userId: "u",
      topic: `leaked ${FAKE_GH} in title`,
    });
    const row = db.query("SELECT topic FROM watch_sessions WHERE id = ?").get(s.id) as {
      topic: string;
    };
    expect(row.topic).not.toContain(FAKE_GH);
    expect(row.topic).toContain("[redacted:github-token]");
    db.close();
  });

  test("without a db the store stays in-memory", () => {
    const store = new SessionStore({ ttlMs: TTL });
    expect(store.durable).toBe(false);
    const s = store.create({ repo: "o/r", number: 4, userId: "u" });
    store.touch(s);
    expect(store.getByIssue("o/r", 4)?.id).toBe(s.id);
  });
});

describe("startWatchPoller durable sessions (REQ-watch-037)", () => {
  const envBase = {
    GITHUB_TOKEN: "fake",
    CORVIDINHO_WATCH_USERNAME: "corvid-agent",
    CORVIDINHO_GITHUB_ALLOW_REPOS: "CorvidLabs/Corvidinho",
    CORVIDINHO_GITHUB_ALLOW_USERS: "0xLeif",
    CORVIDINHO_WATCH_DRY_RUN: "1",
  };

  test("restart on the same data dir continues the same issue session", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-watch-poll-"));
    try {
      const env = { ...envBase, CORVIDINHO_DATA_DIR: dir };
      const logs: string[] = [];
      const run = async (id: string) => {
        const actions: Array<{ kind: string; sessionId?: string }> = [];
        const result = await startWatchPoller({
          env,
          filePath: null,
          runLoop: false,
          agent: createEchoAgentClient(),
          log: (m) => logs.push(m),
          fetchEvents: async () => [ev({ id })],
          onAction: (info) => actions.push({ kind: info.kind, sessionId: info.sessionId }),
        });
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("start failed");
        expect(result.store.durable).toBe(true);
        await result.pollOnce();
        await result.stop();
        await result.stop(); // idempotent close
        return actions;
      };

      const first = await run("c-before");
      expect(first[0]?.kind).toBe("start_session");
      const second = await run("c-after");
      expect(second[0]?.kind).toBe("continue_session");
      expect(second[0]?.sessionId).toBe(first[0]?.sessionId);
      expect(logs.some((l) => l.startsWith("[watch] sessions: 1 restored"))).toBe(true);

      const db = openCorvidinhoDb({ env });
      expect(rowCount(db)).toBe(1);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("injected db is used and not closed on stop", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const result = await startWatchPoller({
      env: envBase,
      filePath: null,
      runLoop: false,
      db,
      sessionTtlMs: TTL,
      agent: createEchoAgentClient(),
      log: () => {},
      fetchEvents: async () => [ev({ id: "c-inj" })],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.store.ttlMs).toBe(TTL);
    await result.pollOnce();
    await result.stop();
    expect(rowCount(db)).toBe(1);
    db.close();
  });

  test("dry-run without a data dir stays in-memory (restart starts fresh)", async () => {
    const run = async (id: string) => {
      const kinds: string[] = [];
      const result = await startWatchPoller({
        env: envBase,
        filePath: null,
        runLoop: false,
        agent: createEchoAgentClient(),
        log: () => {},
        fetchEvents: async () => [ev({ id })],
        onAction: (info) => kinds.push(info.kind),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("start failed");
      await result.pollOnce();
      await result.stop();
      return kinds;
    };
    expect(await run("m-1")).toEqual(["start_session"]);
    // Nothing was written to a shared file DB, so a new poller starts fresh.
    expect(await run("m-2")).toEqual(["start_session"]);
  });
});

/**
 * Durable WATCH SessionStore + soft TTL (REQ-watch-037 / REQ-discord-037,
 * SESSION-1..3). Fixture only: temp DB files, no network, no live tokens.
 * Fake secrets are assembled at runtime — never realistic literals in the repo.
 */
import { describe, expect, jest, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyConfig } from "../src/allowlist/types.ts";
import { migrateCorvidinhoDb, openCorvidinhoDb, SCHEMA_VERSION } from "../src/store/db.ts";
import { rescrubDatabase, SCRUB_TARGETS } from "../src/store/scrub.ts";
import type { AckClient } from "../src/watch/ack.ts";
import { createEchoAgentClient, type AgentClient } from "../src/watch/agent-client.ts";
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
  test("fresh DB reaches schema 6+ with watch_sessions", () => {
    const db = openCorvidinhoDb({ memory: true });
    // v7 (AUTONOMY-2 schedule ping dedupe), v8 (pending ask), v9
    // (in-flight Discord replies, REQ-discord-311), v10 (schedule run
    // runner, REQ-discord-346), v11 (schedule run asks, REQ-discord-347),
    // v12 (forget requests, REQ-discord-101), v13 (retained
    // conversations, REQ-discord-472) and v14 (approval cards,
    // REQ-discord-096) build on v6.
    expect(SCHEMA_VERSION).toBe(14);
    const v = db.query("SELECT value FROM schema_meta WHERE key = 'version'").get() as {
      value: string;
    };
    expect(v.value).toBe(String(SCHEMA_VERSION));
    const t = db
      .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'watch_sessions'")
      .get();
    expect(t).not.toBeNull();
    db.close();
  });

  test("a v5 DB migrates through 6 and keeps existing rows", () => {
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
    expect(v.value).toBe(String(SCHEMA_VERSION));
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

  test("touch after another watcher replaced the issue row does not throw (latest write wins)", () =>
    withTempDir((dir) => {
      const path = join(dir, "corvidinho.db");
      const dbA = openCorvidinhoDb({ path });
      const dbB = openCorvidinhoDb({ path });
      const storeA = new SessionStore({ db: dbA, ttlMs: TTL });
      const sA = storeA.create({ repo: "o/r", number: 5, userId: "u" });
      // Second watcher on the same data dir supersedes A's row for o/r#5.
      const storeB = new SessionStore({ db: dbB, ttlMs: TTL });
      const sB = storeB.create({ repo: "o/r", number: 5, userId: "u" });
      expect(sB.id).not.toBe(sA.id);
      expect(() => storeA.touch(sA)).not.toThrow();
      const rows = dbA
        .query("SELECT id FROM watch_sessions WHERE issue_key = 'o/r#5'")
        .all() as Array<{ id: string }>;
      expect(rows.map((r) => r.id)).toEqual([sA.id]);
      expect(rowCount(dbA)).toBe(1);
      dbA.close();
      dbB.close();
    }));

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

/** Deferred gate so a test controls exactly when an in-flight step finishes. */
function gate(): { wait: Promise<void>; open: () => void } {
  let open!: () => void;
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { wait, open };
}

/** Agent that records each spawn and blocks the first one until released. */
function blockingAgent() {
  const spawns: number[] = [];
  const firstStarted = gate();
  const release = gate();
  const agent: AgentClient = {
    async runChat({ sessionId }) {
      spawns.push(spawns.length + 1);
      if (spawns.length === 1) {
        firstStarted.open();
        await release.wait;
      }
      return { ok: true, sessionId, summary: "ok", exitCode: 0 };
    },
  };
  return { agent, spawns, firstStarted, release };
}

/** Let pending promise callbacks run (no timers involved). */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe("startWatchPoller stop, single-flight, per-event isolation (REQ-watch-037)", () => {
  const env = {
    GITHUB_TOKEN: "fake",
    CORVIDINHO_WATCH_USERNAME: "corvid-agent",
    CORVIDINHO_GITHUB_ALLOW_REPOS: "CorvidLabs/Corvidinho",
    CORVIDINHO_GITHUB_ALLOW_USERS: "0xLeif",
    CORVIDINHO_WATCH_DRY_RUN: "1",
  };
  const threeIssues = () => [
    ev({ id: "s-1", number: 1 }),
    ev({ id: "s-2", number: 2 }),
    ev({ id: "s-3", number: 3 }),
  ];

  test("stop() mid-cycle: no agent spawn starts after stop, and stop waits for the in-flight run", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-watch-stop-"));
    try {
      const { agent, spawns, firstStarted, release } = blockingAgent();
      const result = await startWatchPoller({
        env: { ...env, CORVIDINHO_DATA_DIR: dir },
        filePath: null,
        runLoop: false,
        agent,
        log: () => {},
        fetchEvents: async () => threeIssues(),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const cycle = result.pollOnce();
      await firstStarted.wait;
      let stopped = false;
      const stopping = result.stop().then(() => {
        stopped = true;
      });
      await flushMicrotasks();
      // The first run is still in flight: stop() has not closed the DB yet.
      expect(stopped).toBe(false);

      release.open();
      await stopping;
      const r = await cycle;
      expect(spawns).toEqual([1]);
      expect(r.started).toBe(1);

      // Only the handled issue has a session row.
      const db = openCorvidinhoDb({ env: { ...env, CORVIDINHO_DATA_DIR: dir } });
      expect(rowCount(db)).toBe(1);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("stop() while the ack is in flight: that event's agent never spawns", async () => {
    const ackStarted = gate();
    const ackRelease = gate();
    const ackClient: AckClient = {
      async createIssueComment() {
        ackStarted.open();
        await ackRelease.wait;
        return { ok: true, dryRun: true };
      },
    };
    const { agent, spawns } = blockingAgent();
    const result = await startWatchPoller({
      env,
      filePath: null,
      runLoop: false,
      agent,
      ackClient,
      log: () => {},
      fetchEvents: async () => [ev({ id: "ack-1", number: 7 })],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const cycle = result.pollOnce();
    await ackStarted.wait;
    const stopping = result.stop();
    ackRelease.open();
    await stopping;
    await cycle;
    expect(spawns).toEqual([]);
  });

  test("single-flight: concurrent pollOnce joins the in-flight cycle", async () => {
    let fetches = 0;
    const { agent, spawns, firstStarted, release } = blockingAgent();
    const result = await startWatchPoller({
      env,
      filePath: null,
      runLoop: false,
      agent,
      log: () => {},
      fetchEvents: async () => {
        fetches += 1;
        return threeIssues();
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const a = result.pollOnce();
    await firstStarted.wait;
    const b = result.pollOnce();
    release.open();
    const [ra, rb] = await Promise.all([a, b]);
    expect(rb).toBe(ra);
    expect(fetches).toBe(1);
    expect(spawns).toEqual([1, 2, 3]);

    // Once idle, the next pollOnce runs a fresh cycle (all ids now processed).
    const rc = await result.pollOnce();
    expect(fetches).toBe(2);
    expect(rc.newEvents).toBe(0);
    await result.stop();
  });

  test("single-flight: no second cycle starts while a long loop cycle runs", async () => {
    jest.useFakeTimers();
    try {
      let fetches = 0;
      const { agent, spawns, firstStarted, release } = blockingAgent();
      const result = await startWatchPoller({
        env,
        filePath: null,
        agent,
        log: () => {},
        fetchEvents: async () => {
          fetches += 1;
          return threeIssues();
        },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // The loop fires once immediately; the first agent run is still going.
      jest.advanceTimersByTime(0);
      await firstStarted.wait;
      jest.advanceTimersByTime(result.config.intervalMs * 3);
      await flushMicrotasks();
      expect(fetches).toBe(1);

      // pollOnce joins the in-flight loop cycle instead of starting another.
      release.open();
      await result.pollOnce();
      expect(fetches).toBe(1);
      expect(spawns).toEqual([1, 2, 3]);
      await result.stop();
    } finally {
      jest.useRealTimers();
    }
  });

  test("single-flight: the loop tick joins a direct pollOnce already in flight", async () => {
    jest.useFakeTimers();
    try {
      let fetches = 0;
      const { agent, spawns, firstStarted, release } = blockingAgent();
      const result = await startWatchPoller({
        env,
        filePath: null,
        agent,
        log: () => {},
        fetchEvents: async () => {
          fetches += 1;
          return threeIssues();
        },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // A direct cycle is mid-run when the loop's first tick fires.
      const direct = result.pollOnce();
      await firstStarted.wait;
      jest.advanceTimersByTime(0);
      await flushMicrotasks();
      expect(fetches).toBe(1);

      release.open();
      await direct;
      await flushMicrotasks();
      expect(fetches).toBe(1);
      expect(spawns).toEqual([1, 2, 3]);
      await result.stop();
    } finally {
      jest.useRealTimers();
    }
  });

  test("a failing event is logged and marked processed; later events still run", async () => {
    const store = new SessionStore({ ttlMs: TTL });
    const realGet = store.getByIssue.bind(store);
    let busyHits = 0;
    store.getByIssue = (repo: string, number: number) => {
      if (number === 1) {
        busyHits += 1;
        throw new Error("SQLITE_BUSY: database is locked");
      }
      return realGet(repo, number);
    };
    const errors: string[] = [];
    const kinds: string[] = [];
    const result = await startWatchPoller({
      env,
      filePath: null,
      runLoop: false,
      sessionStore: store,
      agent: createEchoAgentClient(),
      log: () => {},
      logError: (msg) => errors.push(msg),
      fetchEvents: async () => [ev({ id: "busy-1", number: 1 }), ev({ id: "ok-2", number: 2 })],
      onAction: (info) => kinds.push(`${info.kind}:${info.event.id}`),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const r1 = await result.pollOnce();
    expect(r1.started).toBe(1);
    expect(kinds).toEqual(["start_session:ok-2"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("CorvidLabs/Corvidinho#1 (busy-1) failed; marked processed");
    expect(result.processed.list()).toContain("busy-1");

    // Not retried forever: the next cycle sees nothing new.
    const r2 = await result.pollOnce();
    expect(r2.newEvents).toBe(0);
    expect(busyHits).toBe(1);
    await result.stop();
  });

  test("a second watcher replacing the issue row does not wedge the cycle", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-watch-two-"));
    try {
      const path = join(dir, "corvidinho.db");
      const dbA = openCorvidinhoDb({ path });
      const dbB = openCorvidinhoDb({ path });
      const storeA = new SessionStore({ db: dbA, ttlMs: TTL });
      storeA.create({ repo: "CorvidLabs/Corvidinho", number: 1, userId: "0xLeif" });
      new SessionStore({ db: dbB, ttlMs: TTL }).create({
        repo: "CorvidLabs/Corvidinho",
        number: 1,
        userId: "0xLeif",
      });

      const errors: string[] = [];
      const kinds: string[] = [];
      const result = await startWatchPoller({
        env,
        filePath: null,
        runLoop: false,
        sessionStore: storeA,
        agent: createEchoAgentClient(),
        log: () => {},
        logError: (msg) => errors.push(msg),
        fetchEvents: async () => [ev({ id: "two-1", number: 1 }), ev({ id: "two-2", number: 2 })],
        onAction: (info) => kinds.push(`${info.kind}:${info.event.id}`),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      await result.pollOnce();
      expect(errors).toEqual([]);
      expect(kinds).toEqual(["continue_session:two-1", "start_session:two-2"]);
      expect(rowCount(dbA)).toBe(2);
      await result.stop();
      dbA.close();
      dbB.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

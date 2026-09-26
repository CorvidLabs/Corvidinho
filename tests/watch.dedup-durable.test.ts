/**
 * WATCH handles each event id at most once, across restarts and stranger
 * floods (REQ-watch-247, REQ-watch-005 / 007 / 009, WATCH-RELIABILITY-1,
 * ALLOW-1). Fixture only: temp DB files, no network, no live tokens.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { AckedIdStore, createEchoAckClient } from "../src/watch/ack.ts";
import type { AgentClient } from "../src/watch/agent-client.ts";
import { ProcessedIdStore } from "../src/watch/dedup.ts";
import { startWatchPoller } from "../src/watch/poller.ts";
import { SummarizedIdStore } from "../src/watch/summary.ts";
import type { DetectedEvent } from "../src/watch/types.ts";

const envBase = {
  GITHUB_TOKEN: "fake",
  CORVIDINHO_WATCH_USERNAME: "corvid-agent",
  CORVIDINHO_GITHUB_ALLOW_REPOS: "CorvidLabs/Corvidinho",
  CORVIDINHO_GITHUB_ALLOW_USERS: "0xLeif",
  CORVIDINHO_WATCH_DRY_RUN: "1",
};

function ev(over: Partial<DetectedEvent> = {}): DetectedEvent {
  return {
    id: over.id ?? "comment-7001",
    type: over.type ?? "issue_comment",
    body: over.body ?? "@corvid-agent open a release PR",
    sender: over.sender ?? "0xLeif",
    repo: over.repo ?? "CorvidLabs/Corvidinho",
    number: over.number ?? 7,
    title: over.title ?? "release",
    htmlUrl: over.htmlUrl ?? "https://example.com/7",
    createdAt: over.createdAt ?? "2026-09-26T12:00:00Z",
    isPullRequest: over.isPullRequest ?? false,
  };
}

/** Agent that records every prompt it is asked to run. */
function countingAgent(): { agent: AgentClient; prompts: string[] } {
  const prompts: string[] = [];
  return {
    prompts,
    agent: {
      async runChat({ prompt, sessionId }) {
        prompts.push(prompt);
        return { ok: true, sessionId, summary: "done", exitCode: 0 };
      },
    },
  };
}

describe("WATCH event ids survive a restart (REQ-watch-247)", () => {
  test("a restarted watcher does not re-run, re-ack or re-summarize a handled request", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-watch-ids-"));
    try {
      const env = { ...envBase, CORVIDINHO_DATA_DIR: dir };
      const { agent, prompts } = countingAgent();
      const ackClient = createEchoAckClient();
      const trusted = ev();

      const runProcess = async () => {
        const result = await startWatchPoller({
          env,
          filePath: null,
          runLoop: false,
          agent,
          ackClient,
          log: () => {},
          fetchEvents: async () => [trusted],
        });
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("start failed");
        const cycle = await result.pollOnce();
        await result.stop();
        return cycle;
      };

      const first = await runProcess();
      expect(first.started).toBe(1);

      // Same 2-day search window after a redeploy / crash / reboot.
      const second = await runProcess();
      expect(second.newEvents).toBe(0);
      expect(second.started + second.continued).toBe(0);

      expect(prompts).toHaveLength(1);
      // One ack + one run summary, never a second pair.
      expect(ackClient.posts).toHaveLength(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("denied ids cannot evict handled ids (REQ-watch-247, ALLOW-1)", () => {
  test("2000 stranger mentions do not make a trusted request run again", async () => {
    const { agent, prompts } = countingAgent();
    const trusted = ev({ id: "comment-trusted" });
    // 40 issues x 50 comments from a non-allowlisted user.
    const flood = Array.from({ length: 2000 }, (_, i) =>
      ev({
        id: `comment-stranger-${i}`,
        sender: "random-user",
        number: 100 + (i % 40),
        body: "@corvid-agent hi",
      }),
    );
    let batch: DetectedEvent[] = [trusted];

    const result = await startWatchPoller({
      env: envBase,
      filePath: null,
      runLoop: false,
      agent,
      ackClient: createEchoAckClient(),
      log: () => {},
      fetchEvents: async () => batch,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const c1 = await result.pollOnce();
    expect(c1.started).toBe(1);

    batch = [...flood, trusted];
    const c2 = await result.pollOnce();
    expect(c2.refused).toBe(2000);
    expect(c2.started + c2.continued).toBe(0);

    const c3 = await result.pollOnce();
    expect(c3.started + c3.continued).toBe(0);
    expect(result.processed.has("comment-trusted")).toBe(true);
    expect(prompts).toHaveLength(1);
    await result.stop();
  });
});

describe("a failed id write never aborts the cycle (REQ-watch-247, REQ-watch-037)", () => {
  test("the event is left for the next cycle and nothing ran for it", async () => {
    const { agent, prompts } = countingAgent();
    const errors: string[] = [];
    const result = await startWatchPoller({
      env: envBase,
      filePath: null,
      runLoop: false,
      agent,
      ackClient: createEchoAckClient(),
      log: () => {},
      logError: (msg) => errors.push(msg),
      fetchEvents: async () => [ev({ id: "c-busy", number: 1 })],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const realAddMany = result.processed.addMany.bind(result.processed);
    let failWrites = true;
    result.processed.addMany = (ids: string[]) => {
      if (failWrites) throw new Error("SQLITE_BUSY: database is locked");
      realAddMany(ids);
    };

    const c1 = await result.pollOnce();
    expect(c1.started + c1.continued).toBe(0);
    expect(prompts).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("(c-busy) failed; not marked, retried next cycle");

    failWrites = false;
    const c2 = await result.pollOnce();
    expect(c2.started + c2.continued).toBe(1);
    expect(prompts).toHaveLength(1);
    const c3 = await result.pollOnce();
    expect(c3.newEvents).toBe(0);
    await result.stop();
  });
});

describe("id write failures never lose or skip a trusted request (REQ-watch-247)", () => {
  test("an id write that fails once and would succeed on retry still leaves the event for the next cycle", async () => {
    const { agent, prompts } = countingAgent();
    const errors: string[] = [];
    const result = await startWatchPoller({
      env: envBase,
      filePath: null,
      runLoop: false,
      agent,
      ackClient: createEchoAckClient(),
      log: () => {},
      logError: (msg) => errors.push(msg),
      fetchEvents: async () => [ev({ id: "c-flaky", number: 2 })],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const realAddMany = result.processed.addMany.bind(result.processed);
    let calls = 0;
    // Only the first write fails (a lock that clears a moment later).
    result.processed.addMany = (ids: string[]) => {
      calls += 1;
      if (calls === 1) throw new Error("SQLITE_BUSY: database is locked");
      realAddMany(ids);
    };

    const c1 = await result.pollOnce();
    expect(c1.started + c1.continued).toBe(0);
    expect(prompts).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("(c-flaky) failed; not marked, retried next cycle");
    // Nothing ran, so the id must not be recorded as handled.
    expect(result.processed.has("c-flaky")).toBe(false);

    const c2 = await result.pollOnce();
    expect(c2.newEvents).toBe(1);
    expect(c2.started + c2.continued).toBe(1);
    expect(prompts).toHaveLength(1);
    const c3 = await result.pollOnce();
    expect(c3.newEvents).toBe(0);
    expect(prompts).toHaveLength(1);
    await result.stop();
  });

  test("a failed acked/summarized id write after the comment is posted still runs the agent once", async () => {
    const { agent, prompts } = countingAgent();
    const errors: string[] = [];
    const logs: string[] = [];
    const ackClient = createEchoAckClient();
    const result = await startWatchPoller({
      env: envBase,
      filePath: null,
      runLoop: false,
      agent,
      ackClient,
      log: (msg) => logs.push(msg),
      logError: (msg) => errors.push(msg),
      fetchEvents: async () => [ev({ id: "c-ackdb", number: 3 })],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.acked.add = () => {
      throw new Error("SQLITE_BUSY: database is locked");
    };
    result.summarized.add = () => {
      throw new Error("SQLITE_BUSY: database is locked");
    };

    const c1 = await result.pollOnce();
    expect(c1.started).toBe(1);
    // The ack was posted, so the run and its summary must follow.
    expect(prompts).toHaveLength(1);
    expect(ackClient.posts).toHaveLength(2);
    expect(errors).toHaveLength(0);
    expect(logs.some((l) => l.includes("ack id write failed id=c-ackdb"))).toBe(true);
    expect(logs.some((l) => l.includes("summary id write failed id=c-ackdb"))).toBe(true);

    // Still handled once: the processed id guards the next cycle.
    const c2 = await result.pollOnce();
    expect(c2.newEvents).toBe(0);
    expect(prompts).toHaveLength(1);
    expect(ackClient.posts).toHaveLength(2);
    await result.stop();
  });
});

describe("durable id stores (REQ-watch-247)", () => {
  test("processed, acked and summarized ids persist per kind on the shared DB", () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-watch-idstore-"));
    try {
      const path = join(dir, "corvidinho.db");
      const db1 = openCorvidinhoDb({ path });
      const processed1 = new ProcessedIdStore({ db: db1 });
      processed1.addMany(["Comment-1", "issue-CorvidLabs/Corvidinho#7"]);
      new AckedIdStore({ db: db1 }).add("comment-1");
      new SummarizedIdStore({ db: db1 }).add("comment-2");
      db1.close();

      const db2 = openCorvidinhoDb({ path });
      const processed2 = new ProcessedIdStore({ db: db2 });
      expect(processed2.durable).toBe(true);
      // Ids are case-insensitive, as before.
      expect(processed2.has("comment-1")).toBe(true);
      expect(processed2.has("ISSUE-corvidlabs/corvidinho#7")).toBe(true);
      expect(processed2.list()).toEqual(["comment-1", "issue-corvidlabs/corvidinho#7"]);
      expect(processed2.has("comment-2")).toBe(false);

      // Kinds do not leak into each other.
      const acked2 = new AckedIdStore({ db: db2 });
      const summarized2 = new SummarizedIdStore({ db: db2 });
      expect(acked2.has("comment-1")).toBe(true);
      expect(acked2.has("comment-2")).toBe(false);
      expect(summarized2.has("comment-2")).toBe(true);
      expect(summarized2.has("comment-1")).toBe(false);
      db2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a durable store is not FIFO-capped", () => {
    const db = openCorvidinhoDb({ memory: true });
    const store = new ProcessedIdStore({ db, maxSize: 2 });
    store.addMany(["a", "b", "c"]);
    expect(store.has("a")).toBe(true);
    expect(store.list()).toHaveLength(3);
    db.close();
  });

  test("without a db the stores stay in-memory with the FIFO cap", () => {
    const store = new ProcessedIdStore(2);
    expect(store.durable).toBe(false);
    store.addMany(["a", "b", "c"]);
    expect(store.has("a")).toBe(false);
    expect(store.list()).toEqual(["b", "c"]);
    const acked = new AckedIdStore();
    acked.add("X");
    expect(acked.has("x")).toBe(true);
  });
});

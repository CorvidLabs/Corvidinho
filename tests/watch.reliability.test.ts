/**
 * WATCH-RELIABILITY-1..3 — summary once-per-event, spawn outcome log, 403 backoff.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEchoAckClient } from "../src/watch/ack.ts";
import { createEchoAgentClient, type AgentClient } from "../src/watch/agent-client.ts";
import { startWatchPoller } from "../src/watch/poller.ts";
import {
  computeRateLimitBackoffMs,
  DEFAULT_RATE_LIMIT_BACKOFF_MS,
  formatRateLimitLog,
  GithubRateLimitError,
  parseGithubRateLimit,
} from "../src/watch/rate-limit.ts";
import {
  classifySpawnError,
  createMemorySpawnOutcomeStore,
  formatSpawnOutcomeLog,
  SpawnOutcomeStore,
} from "../src/watch/spawn-log.ts";
import {
  buildSummaryBody,
  maybePostWatchSummary,
  SuccessfulAckStore,
  SummarizedIdStore,
} from "../src/watch/summary.ts";
import type { DetectedEvent } from "../src/watch/types.ts";

function mkEvent(over: Partial<DetectedEvent> = {}): DetectedEvent {
  return {
    id: over.id ?? "comment-1",
    type: over.type ?? "issue_comment",
    body: over.body ?? "@corvid-agent hi",
    sender: over.sender ?? "0xLeif",
    repo: over.repo ?? "CorvidLabs/Corvidinho",
    number: over.number ?? 42,
    title: over.title ?? "t",
    htmlUrl: over.htmlUrl ?? "https://example.com",
    createdAt: over.createdAt ?? "2026-09-26T12:00:00Z",
    isPullRequest: over.isPullRequest ?? false,
  };
}

const envBase = {
  GITHUB_TOKEN: "fake",
  CORVIDINHO_WATCH_USERNAME: "corvid-agent",
  CORVIDINHO_GITHUB_ALLOW_REPOS: "CorvidLabs/Corvidinho",
  CORVIDINHO_GITHUB_ALLOW_USERS: "0xLeif",
  CORVIDINHO_WATCH_DRY_RUN: "1",
};

describe("WATCH-RELIABILITY-3 rate-limit backoff", () => {
  test("Retry-After seconds wins", () => {
    const b = computeRateLimitBackoffMs(
      { "retry-after": "120", "x-ratelimit-reset": "1" },
      1_000_000,
    );
    expect(b.reason).toBe("retry-after-seconds");
    expect(b.waitMs).toBe(120_000);
  });

  test("x-ratelimit-reset used when no Retry-After", () => {
    const now = 1_700_000_000_000;
    const resetSec = Math.floor(now / 1000) + 90;
    const b = computeRateLimitBackoffMs(
      { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(resetSec) },
      now,
    );
    expect(b.reason).toBe("x-ratelimit-reset");
    expect(b.waitMs).toBeGreaterThanOrEqual(89_000);
    expect(b.waitMs).toBeLessThanOrEqual(91_000);
  });

  test("documented default when headers missing", () => {
    const b = computeRateLimitBackoffMs({}, 0);
    expect(b.reason).toBe("default");
    expect(b.waitMs).toBe(DEFAULT_RATE_LIMIT_BACKOFF_MS);
  });

  test("parseGithubRateLimit detects 403 rate-limit message", () => {
    const err = {
      status: 403,
      message: "API rate limit exceeded for user ID 1",
      response: { headers: { "retry-after": "30" } },
    };
    const b = parseGithubRateLimit(err, Date.now());
    expect(b).not.toBeNull();
    expect(b!.waitMs).toBe(30_000);
    expect(b!.reason).toBe("retry-after-seconds");
  });

  test("parseGithubRateLimit ignores plain 403 without rate-limit signal", () => {
    const err = { status: 403, message: "Resource not accessible by integration" };
    expect(parseGithubRateLimit(err)).toBeNull();
  });

  test("formatRateLimitLog is clear", () => {
    const line = formatRateLimitLog(
      { waitMs: 60_000, reason: "default" },
      Date.parse("2026-09-26T20:22:00Z"),
    );
    expect(line).toContain("[watch] github rate-limit backoff");
    expect(line).toContain("ms=60000");
    expect(line).toContain("reason=default");
  });

  test("poller backs off on rate-limit fetch error; no tight loop", async () => {
    const logs: string[] = [];
    let clock = 1_000_000;
    const result = await startWatchPoller({
      env: envBase,
      filePath: null,
      runLoop: false,
      agent: createEchoAgentClient(),
      now: () => clock,
      log: (m) => logs.push(m),
      fetchEvents: async () => {
        throw new GithubRateLimitError({
          message: "API rate limit exceeded",
          waitMs: 45_000,
          reason: "retry-after-seconds",
          headers: { "retry-after": "45" },
        });
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const c1 = await result.pollOnce();
    expect(c1.rateLimited).toBe(true);
    expect(c1.backoffMs).toBe(45_000);
    expect(logs.some((l) => l.includes("github rate-limit backoff"))).toBe(true);
    expect(result.getBackoffUntilMs()).toBe(clock + 45_000);

    // Immediate re-poll while in backoff should skip (no tight loop).
    const c2 = await result.pollOnce();
    expect(c2.rateLimited).toBe(true);
    expect(logs.some((l) => l.includes("poll skip rate-limit backoff"))).toBe(
      true,
    );

    // After backoff elapses, a successful fetch proceeds.
    clock += 46_000;
    const c3 = await startWatchPoller({
      env: envBase,
      filePath: null,
      runLoop: false,
      agent: createEchoAgentClient(),
      now: () => clock,
      log: (m) => logs.push(m),
      fetchEvents: async () => [],
    });
    expect(c3.ok).toBe(true);
    if (c3.ok) {
      const cycle = await c3.pollOnce();
      expect(cycle.rateLimited).toBeFalsy();
      expect(cycle.fetched).toBe(0);
      await c3.stop();
    }
    await result.stop();
  });
});

describe("WATCH-RELIABILITY-2 spawn outcome logging", () => {
  test("classifySpawnError maps ok / nonzero / throw", () => {
    expect(classifySpawnError(true, 0)).toBe("ok");
    expect(classifySpawnError(false, 2)).toBe("exit_nonzero");
    expect(classifySpawnError(false, 1, true)).toBe("spawn_throw");
  });

  test("structured log line + durable JSONL store", () => {
    const dir = mkdtempSync(join(tmpdir(), "watch-spawn-"));
    const path = join(dir, "watch-spawn.jsonl");
    const store = new SpawnOutcomeStore({ path });
    const outcome = {
      startedAt: "2026-09-26T20:00:00.000Z",
      finishedAt: "2026-09-26T20:00:01.500Z",
      eventId: "comment-9",
      sessionId: "sess_1",
      repo: "CorvidLabs/Corvidinho",
      number: 42,
      ok: true,
      exitCode: 0,
      errorClass: "ok",
      durationMs: 1500,
      summaryPreview: "state=done",
    };
    store.append(outcome);
    const line = formatSpawnOutcomeLog(outcome);
    expect(line).toContain("[watch] spawn outcome");
    expect(line).toContain("error_class=ok");
    expect(line).toContain("duration_ms=1500");
    const raw = readFileSync(path, "utf8");
    expect(raw).toContain('"eventId":"comment-9"');
    expect(store.list()).toHaveLength(1);
  });

  test("poller records spawn start + outcome for allowlisted comment", async () => {
    const logs: string[] = [];
    const mem = createMemorySpawnOutcomeStore();
    let t = 5_000;
    const result = await startWatchPoller({
      env: envBase,
      filePath: null,
      runLoop: false,
      agent: createEchoAgentClient(),
      spawnOutcomeStore: mem,
      now: () => {
        t += 250;
        return t;
      },
      log: (m) => logs.push(m),
      fetchEvents: async () => [
        mkEvent({ id: "comment-spawn-1", sender: "0xLeif" }),
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await result.pollOnce();
    expect(logs.some((l) => l.includes("[watch] spawn start"))).toBe(true);
    expect(logs.some((l) => l.includes("[watch] spawn outcome"))).toBe(true);
    expect(mem.records).toHaveLength(1);
    expect(mem.records[0]!.eventId).toBe("comment-spawn-1");
    expect(mem.records[0]!.errorClass).toBe("ok");
    expect(mem.records[0]!.durationMs).toBeGreaterThanOrEqual(0);
    await result.stop();
  });
});

describe("WATCH-RELIABILITY-1 once-per-event summary", () => {
  test("buildSummaryBody includes status + Made with Corvidinho", () => {
    const ok = buildSummaryBody({
      ok: true,
      sessionId: "s",
      summary: "shipped the thing",
      exitCode: 0,
    });
    expect(ok).toContain("Done");
    expect(ok).toContain("shipped the thing");
    expect(ok).toContain("Made with");
    expect(ok).toContain("Corvidinho");

    const fail = buildSummaryBody({
      ok: false,
      sessionId: "s",
      summary: "boom",
      exitCode: 7,
    });
    expect(fail).toContain("Failed (exit 7)");
    expect(fail).toContain("Made with");
  });

  test("maybePostWatchSummary once per event; requires successful ack", async () => {
    const client = createEchoAckClient();
    const successfulAcks = new SuccessfulAckStore();
    const summarized = new SummarizedIdStore();
    const event = mkEvent({ id: "comment-sum-1" });
    const spawn = {
      ok: true,
      sessionId: "sess",
      summary: "all good",
      exitCode: 0,
    };

    const skip = await maybePostWatchSummary({
      event,
      spawn,
      ackClient: client,
      successfulAcks,
      summarized,
    });
    expect(skip).toBe(false);
    expect(client.posts).toHaveLength(0);

    successfulAcks.add(event.id);
    const first = await maybePostWatchSummary({
      event,
      spawn,
      ackClient: client,
      successfulAcks,
      summarized,
    });
    expect(first).toBe(true);
    expect(client.posts).toHaveLength(1);
    expect(client.posts[0]!.body).toContain("all good");

    const second = await maybePostWatchSummary({
      event,
      spawn: { ...spawn, ok: false, exitCode: 1, summary: "fail" },
      ackClient: client,
      successfulAcks,
      summarized,
    });
    expect(second).toBe(false);
    expect(client.posts).toHaveLength(1);
  });

  test("poller posts ack then summary once for success and failure", async () => {
    const ack = createEchoAckClient();
    const logs: string[] = [];

    const failingAgent: AgentClient = {
      async runChat() {
        return {
          ok: false,
          sessionId: "x",
          summary: "agent blew up",
          exitCode: 3,
        };
      },
    };

    const result = await startWatchPoller({
      env: envBase,
      filePath: null,
      runLoop: false,
      agent: failingAgent,
      ackClient: ack,
      spawnOutcomeStore: createMemorySpawnOutcomeStore(),
      log: (m) => logs.push(m),
      fetchEvents: async () => [
        mkEvent({ id: "comment-sum-poll", sender: "0xLeif" }),
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await result.pollOnce();

    // ack + summary
    expect(ack.posts.length).toBe(2);
    expect(ack.posts[0]!.body).toContain("Ack —");
    expect(ack.posts[1]!.body).toContain("Failed (exit 3)");
    expect(ack.posts[1]!.body).toContain("agent blew up");
    expect(logs.some((l) => l.includes("summary"))).toBe(true);

    // Second poll with same id should not re-ack/re-summary (processed dedup).
    await result.pollOnce();
    expect(ack.posts.length).toBe(2);
    await result.stop();
  });
});

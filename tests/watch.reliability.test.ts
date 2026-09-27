/**
 * WATCH-RELIABILITY-1..3 — summary once-per-event, spawn outcome log, 403 backoff
 * (poll fetch, auto-ack and run-summary comment).
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEchoAckClient, createOctokitAckClient } from "../src/watch/ack.ts";
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

/** Canned GitHub reply for one comment POST (stubbed transport, no network). */
type CannedReply = {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
};

// Fixture token assembled at runtime; the stubbed fetch never sends it anywhere.
const FIXTURE_TOKEN = ["fixture", "token", "not", "real"].join("-");

const realFetch = globalThis.fetch;
const realConsoleError = console.error;
afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realConsoleError;
});

/**
 * Stub GitHub issue-comment POSTs so the real Octokit ack client runs: each
 * POST gets the next canned reply. Returns the POSTed paths.
 */
function stubCommentPosts(replies: CannedReply[]): string[] {
  const posts: string[] = [];
  // Octokit's request log prints each failed request; keep test output quiet.
  console.error = () => {};
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const method = (input instanceof Request ? input.method : init?.method) ?? "GET";
    if (method !== "POST" || !/\/issues\/\d+\/comments$/.test(url.pathname)) {
      throw new Error(`unexpected request ${method} ${url.pathname}`);
    }
    posts.push(url.pathname);
    const reply = replies[posts.length - 1];
    if (!reply) throw new Error(`no canned reply for POST #${posts.length}`);
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "content-type": "application/json", ...(reply.headers ?? {}) },
    });
  }) as typeof fetch;
  return posts;
}

const created = (id: number): CannedReply => ({
  status: 201,
  body: {
    id,
    html_url: `https://github.com/CorvidLabs/Corvidinho/issues/42#issuecomment-${id}`,
  },
});

const forbidden = (message: string, headers: Record<string, string> = {}): CannedReply => ({
  status: 403,
  body: { message, documentation_url: "https://docs.github.com/rest" },
  headers,
});

/** Poller with the real Octokit ack client over the stubbed transport. */
async function startCommentPoller(opts: {
  now: () => number;
  logs: string[];
  events: DetectedEvent[];
}) {
  let fetches = 0;
  let agentRuns = 0;
  const echo = createEchoAgentClient();
  const agent: AgentClient = {
    async runChat(o) {
      agentRuns += 1;
      return echo.runChat(o);
    },
  };
  const result = await startWatchPoller({
    env: envBase,
    filePath: null,
    runLoop: false,
    agent,
    ackClient: createOctokitAckClient(FIXTURE_TOKEN),
    spawnOutcomeStore: createMemorySpawnOutcomeStore(),
    now: opts.now,
    log: (m) => opts.logs.push(m),
    logError: (m) => opts.logs.push(`ERROR ${m}`),
    fetchEvents: async () => {
      fetches += 1;
      return opts.events;
    },
  });
  if (!result.ok) throw new Error("watch did not start");
  return {
    watch: result,
    fetches: () => fetches,
    agentRuns: () => agentRuns,
  };
}

describe("WATCH-RELIABILITY-3 rate limit on the auto-ack or run-summary comment", () => {
  test("Octokit ack client keeps the status and rate-limit headers of a failed post", async () => {
    stubCommentPosts([
      forbidden("You have exceeded a secondary rate limit.", {
        "retry-after": "90",
        "x-ratelimit-remaining": "4999",
        "x-github-request-id": "ABCD:1234",
      }),
      created(7),
    ]);
    const client = createOctokitAckClient(FIXTURE_TOKEN);
    const opts = { owner: "CorvidLabs", repo: "Corvidinho", issue_number: 42, body: "hi" };

    const failed = await client.createIssueComment(opts);
    expect(failed.ok).toBe(false);
    expect(failed.status).toBe(403);
    expect(failed.error).toContain("secondary rate limit");
    // Only the rate-limit headers are kept.
    expect(failed.headers).toEqual({ "retry-after": "90", "x-ratelimit-remaining": "4999" });
    expect(
      parseGithubRateLimit(
        { status: failed.status, message: failed.error, headers: failed.headers },
        0,
      ),
    ).toEqual({ waitMs: 90_000, reason: "retry-after-seconds", retryAfterHeader: "90" });

    // A successful post returns the same shape as before.
    const ok = await client.createIssueComment(opts);
    expect(ok).toEqual({
      ok: true,
      id: 7,
      url: "https://github.com/CorvidLabs/Corvidinho/issues/42#issuecomment-7",
    });
  });

  test("403 Retry-After on the auto-ack: backoff set, next pollOnce skips the fetch, no tight loop", async () => {
    const posts = stubCommentPosts([
      forbidden("You have exceeded a secondary rate limit.", { "retry-after": "90" }),
    ]);
    const logs: string[] = [];
    let clock = 1_000_000;
    const w = await startCommentPoller({
      now: () => clock,
      logs,
      events: [mkEvent({ id: "comment-rl-ack" })],
    });

    const c1 = await w.watch.pollOnce();
    expect(c1.started).toBe(1);
    expect(c1.rateLimited).toBe(true);
    expect(c1.backoffMs).toBe(90_000);
    expect(w.watch.getBackoffUntilMs()).toBe(clock + 90_000);
    const failedAt = logs.findIndex((l) =>
      l.startsWith("[watch] ack failed CorvidLabs/Corvidinho#42 id=comment-rl-ack: "),
    );
    const backoffAt = logs.indexOf(
      `[watch] github rate-limit backoff ms=90000 until=${new Date(clock + 90_000).toISOString()} reason=retry-after-seconds`,
    );
    expect(failedAt).toBeGreaterThanOrEqual(0);
    expect(backoffAt).toBeGreaterThan(failedAt);
    // WATCH-RELIABILITY-1 unchanged: the request still runs once, and no
    // summary follows a failed ack.
    expect(w.agentRuns()).toBe(1);
    expect(posts).toHaveLength(1);
    expect(logs).toContain("[watch] summary skip no-successful-ack id=comment-rl-ack");
    expect(logs.some((l) => l.startsWith("ERROR"))).toBe(false);

    // Next poll inside the backoff: no fetch, no POST.
    clock += 30_000;
    const c2 = await w.watch.pollOnce();
    expect(c2.rateLimited).toBe(true);
    expect(c2.backoffMs).toBe(60_000);
    expect(logs).toContain("[watch] poll skip rate-limit backoff remaining_ms=60000");
    expect(w.fetches()).toBe(1);
    expect(posts).toHaveLength(1);

    // After the backoff the poll runs; the failed ack is not retried.
    clock += 60_001;
    const c3 = await w.watch.pollOnce();
    expect(c3.rateLimited).toBeFalsy();
    expect(c3.newEvents).toBe(0);
    expect(w.fetches()).toBe(2);
    expect(posts).toHaveLength(1);
    await w.watch.stop();
  });

  test("x-ratelimit-remaining 0 + reset on the run summary: backoff until the reset", async () => {
    const clock = 1_700_000_000_000;
    const resetSec = Math.floor(clock / 1000) + 120;
    const posts = stubCommentPosts([
      created(11),
      forbidden("API rate limit exceeded for user ID 1.", {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(resetSec),
      }),
    ]);
    const logs: string[] = [];
    const w = await startCommentPoller({
      now: () => clock,
      logs,
      events: [mkEvent({ id: "comment-rl-sum" })],
    });

    const c1 = await w.watch.pollOnce();
    expect(posts).toHaveLength(2);
    expect(logs.some((l) => l.startsWith("[watch] ack posted CorvidLabs/Corvidinho#42 id=comment-rl-sum"))).toBe(true);
    const failedAt = logs.findIndex((l) =>
      l.startsWith("[watch] summary failed CorvidLabs/Corvidinho#42 id=comment-rl-sum: "),
    );
    const backoffAt = logs.indexOf(
      `[watch] github rate-limit backoff ms=120000 until=${new Date(clock + 120_000).toISOString()} reason=x-ratelimit-reset`,
    );
    expect(failedAt).toBeGreaterThanOrEqual(0);
    expect(backoffAt).toBeGreaterThan(failedAt);
    expect(c1.rateLimited).toBe(true);
    expect(c1.backoffMs).toBe(120_000);
    expect(w.watch.getBackoffUntilMs()).toBe(clock + 120_000);
    // Marked summarized even on failure (no retry spam, WATCH-RELIABILITY-1).
    expect(w.watch.summarized.has("comment-rl-sum")).toBe(true);

    const c2 = await w.watch.pollOnce();
    expect(c2.rateLimited).toBe(true);
    expect(logs).toContain("[watch] poll skip rate-limit backoff remaining_ms=120000");
    expect(w.fetches()).toBe(1);
    await w.watch.stop();
  });

  test("rate-limit message with no headers on the ack uses the documented 60s default", async () => {
    stubCommentPosts([forbidden("API rate limit exceeded for installation ID 1.")]);
    const logs: string[] = [];
    const clock = 5_000_000;
    const w = await startCommentPoller({
      now: () => clock,
      logs,
      events: [mkEvent({ id: "comment-rl-default" })],
    });
    const c1 = await w.watch.pollOnce();
    expect(c1.rateLimited).toBe(true);
    expect(c1.backoffMs).toBe(DEFAULT_RATE_LIMIT_BACKOFF_MS);
    expect(w.watch.getBackoffUntilMs()).toBe(clock + DEFAULT_RATE_LIMIT_BACKOFF_MS);
    expect(logs).toContain(
      `[watch] github rate-limit backoff ms=60000 until=${new Date(clock + 60_000).toISOString()} reason=default`,
    );
    await w.watch.stop();
  });

  test("a plain 403 on the ack or the summary logs the failure only and sets no backoff", async () => {
    for (const replies of [
      [forbidden("Resource not accessible by integration")],
      [created(21), forbidden("Resource not accessible by integration")],
    ]) {
      const posts = stubCommentPosts(replies);
      const logs: string[] = [];
      const w = await startCommentPoller({
        now: () => 9_000_000,
        logs,
        events: [mkEvent({ id: `comment-plain-${replies.length}` })],
      });
      const c1 = await w.watch.pollOnce();
      expect(posts).toHaveLength(replies.length);
      const kind = replies.length === 1 ? "ack" : "summary";
      expect(
        logs.some((l) =>
          l.startsWith(`[watch] ${kind} failed CorvidLabs/Corvidinho#42 id=comment-plain-${replies.length}: Resource not accessible`),
        ),
      ).toBe(true);
      expect(logs.some((l) => l.includes("rate-limit backoff"))).toBe(false);
      expect(c1.rateLimited).toBeFalsy();
      expect(w.watch.getBackoffUntilMs()).toBe(0);
      // The next poll is not held back.
      await w.watch.pollOnce();
      expect(w.fetches()).toBe(2);
      await w.watch.stop();
    }
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

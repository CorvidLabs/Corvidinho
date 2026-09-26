/**
 * WATCH auto-ack + own-mention skip — fixtures only (REQ-watch-007).
 */
import { describe, expect, test } from "bun:test";
import {
  ACK_START,
  AckedIdStore,
  buildAckBody,
  createEchoAckClient,
  maybePostWatchAck,
  shouldAckEvent,
} from "../src/watch/ack.ts";
import {
  containsMention,
  createFixtureSearchClient,
  fetchWatchEvents,
  type FixtureBundle,
} from "../src/watch/searcher.ts";
import { createEchoAgentClient } from "../src/watch/agent-client.ts";
import { formatCycleLog, startWatchPoller } from "../src/watch/poller.ts";
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

describe("shouldAckEvent + buildAckBody", () => {
  test("acks mention/comment from others; skips own and non-mention types", () => {
    expect(shouldAckEvent(mkEvent(), "corvid-agent")).toBe(true);
    expect(
      shouldAckEvent(mkEvent({ sender: "corvid-agent" }), "corvid-agent"),
    ).toBe(false);
    expect(
      shouldAckEvent(mkEvent({ type: "assignment" }), "corvid-agent"),
    ).toBe(false);
    expect(
      shouldAckEvent(mkEvent({ type: "review_request" }), "corvid-agent"),
    ).toBe(false);
    expect(shouldAckEvent(mkEvent({ type: "issues" }), "corvid-agent")).toBe(
      true,
    );
  });

  test("buildAckBody includes Made with Corvidinho footer", () => {
    const body = buildAckBody("start_session");
    expect(body).toContain(ACK_START);
    expect(body).toContain("Made with");
    expect(body).toContain("Corvidinho");
  });
});

describe("maybePostWatchAck dedup", () => {
  test("posts once per event id; skips own sender", async () => {
    const client = createEchoAckClient();
    const acked = new AckedIdStore();
    const logs: string[] = [];
    const event = mkEvent({ id: "comment-99" });

    const first = await maybePostWatchAck({
      event,
      kind: "start_session",
      mentionUsername: "corvid-agent",
      ackClient: client,
      acked,
      log: (m) => logs.push(m),
    });
    expect(first.attempted).toBe(true);
    expect(first.posted).toBe(true);
    expect(client.posts).toHaveLength(1);
    expect(client.posts[0]!.body).toContain(ACK_START);

    const second = await maybePostWatchAck({
      event,
      kind: "continue_session",
      mentionUsername: "corvid-agent",
      ackClient: client,
      acked,
      log: (m) => logs.push(m),
    });
    expect(second.attempted).toBe(false);
    expect(second.posted).toBe(false);
    expect(client.posts).toHaveLength(1);
    expect(logs.some((l) => l.includes("duplicate"))).toBe(true);

    const own = await maybePostWatchAck({
      event: mkEvent({ id: "comment-own", sender: "corvid-agent" }),
      kind: "start_session",
      mentionUsername: "corvid-agent",
      ackClient: client,
      acked,
      log: (m) => logs.push(m),
    });
    expect(own.attempted).toBe(false);
    expect(own.posted).toBe(false);
    expect(client.posts).toHaveLength(1);
  });
});

describe("fetchWatchEvents ignores own mentions", () => {
  test("own-username comment and issue body mention omitted", async () => {
    const bundle: FixtureBundle = {
      involving: [
        {
          number: 83,
          title: "arcsite ping",
          html_url: "https://github.com/CorvidLabs/arcsite/issues/83",
          body: "self @corvid-agent note",
          user: "corvid-agent",
          created_at: "2026-09-26T12:00:00Z",
          updated_at: "2026-09-26T12:00:00Z",
          repo: "CorvidLabs/arcsite",
        },
        {
          number: 84,
          title: "human ping",
          html_url: "https://github.com/CorvidLabs/arcsite/issues/84",
          body: "hey @corvid-agent",
          user: "0xLeif",
          created_at: "2026-09-26T12:01:00Z",
          updated_at: "2026-09-26T12:01:00Z",
          repo: "CorvidLabs/arcsite",
        },
      ],
      comments: {
        "corvidlabs/arcsite#84": [
          {
            id: 7001,
            body: "Ack — already ours @corvid-agent",
            user: "corvid-agent",
            html_url: "https://example.com/7001",
            created_at: "2026-09-26T12:02:00Z",
          },
          {
            id: 7002,
            body: "@corvid-agent please look",
            user: "0xLeif",
            html_url: "https://example.com/7002",
            created_at: "2026-09-26T12:03:00Z",
          },
        ],
      },
    };
    const events = await fetchWatchEvents({
      client: createFixtureSearchClient(bundle),
      repos: ["CorvidLabs/arcsite"],
      mentionUsername: "corvid-agent",
    });
    expect(events.some((e) => e.id === "issue-CorvidLabs/arcsite#83")).toBe(
      false,
    );
    expect(events.some((e) => e.id === "comment-7001")).toBe(false);
    expect(events.some((e) => e.id === "comment-7002")).toBe(true);
    expect(events.some((e) => e.id === "issue-CorvidLabs/arcsite#84")).toBe(
      true,
    );
    expect(containsMention("hi @corvid-agent", "corvid-agent")).toBe(true);
  });
});

describe("poller cycle log + auto-ack integration", () => {
  const envBase = {
    GITHUB_TOKEN: "fake",
    CORVIDINHO_WATCH_USERNAME: "corvid-agent",
    CORVIDINHO_GITHUB_ALLOW_REPOS: "CorvidLabs/Corvidinho",
    CORVIDINHO_GITHUB_ALLOW_USERS: "0xLeif",
    CORVIDINHO_WATCH_DRY_RUN: "1",
  };

  test("pollOnce logs six counters and acks allowlisted comment", async () => {
    const logs: string[] = [];
    const ack = createEchoAckClient();
    const result = await startWatchPoller({
      env: envBase,
      filePath: null,
      runLoop: false,
      agent: createEchoAgentClient(),
      ackClient: ack,
      log: (m) => logs.push(m),
      fetchEvents: async () => [
        mkEvent({
          id: "comment-ack-1",
          sender: "0xLeif",
          body: "@corvid-agent ping",
        }),
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cycle = await result.pollOnce();
    expect(cycle.started).toBe(1);
    expect(logs.some((l) => l.startsWith("[watch] poll cycle"))).toBe(true);
    expect(logs.some((l) => l.includes("fetched=1"))).toBe(true);
    expect(ack.posts.length).toBeGreaterThanOrEqual(1);
    expect(ack.posts[0]!.body).toContain("Ack —");
    // WATCH-RELIABILITY-1 also posts a run summary after spawn.
    expect(ack.posts.some((p) => p.body.includes("run summary"))).toBe(true);
    expect(formatCycleLog(cycle)).toContain("started=1");
    await result.stop();
  });

  test("pollOnce rejects surface to caller (wrapper catches in loop)", async () => {
    const result = await startWatchPoller({
      env: envBase,
      filePath: null,
      runLoop: false,
      agent: createEchoAgentClient(),
      fetchEvents: async () => {
        throw new Error("boom-fetch");
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await expect(result.pollOnce()).rejects.toThrow("boom-fetch");
    await result.stop();
  });
});

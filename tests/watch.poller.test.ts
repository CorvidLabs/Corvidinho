/**
 * WATCH poller fixture path — no live GitHub / webhook secrets.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createEchoAgentClient } from "../src/watch/agent-client.ts";
import { startWatchPoller } from "../src/watch/poller.ts";
import {
  containsMention,
  createFixtureSearchClient,
  fetchWatchEvents,
  type FixtureBundle,
} from "../src/watch/searcher.ts";
import { filterNewEvents } from "../src/watch/dedup.ts";
import type { DetectedEvent } from "../src/watch/types.ts";

const fixturePath = join(import.meta.dir, "fixtures/watch/mentions.json");
const bundle = JSON.parse(readFileSync(fixturePath, "utf8")) as FixtureBundle;

describe("containsMention + dedup", () => {
  test("detects @username", () => {
    expect(containsMention("hi @corvid-agent please", "corvid-agent")).toBe(
      true,
    );
    expect(containsMention("email corvid-agent@x.com", "corvid-agent")).toBe(
      false,
    );
  });

  test("filterNewEvents skips processed ids", () => {
    const events: DetectedEvent[] = [
      {
        id: "comment-1",
        type: "issue_comment",
        body: "a",
        sender: "u",
        repo: "O/R",
        number: 1,
        title: "t",
        htmlUrl: "",
        createdAt: "2026-09-26T00:00:00Z",
        isPullRequest: false,
      },
      {
        id: "comment-2",
        type: "issue_comment",
        body: "b",
        sender: "u",
        repo: "O/R",
        number: 2,
        title: "t",
        htmlUrl: "",
        createdAt: "2026-09-26T00:00:00Z",
        isPullRequest: false,
      },
    ];
    const fresh = filterNewEvents(events, ["comment-1"]);
    expect(fresh.map((e) => e.id)).toEqual(["comment-2"]);
  });
});

describe("fixture searcher → events", () => {
  test("fetchWatchEvents finds comment, issue mention, review_request", async () => {
    const client = createFixtureSearchClient(bundle);
    const events = await fetchWatchEvents({
      client,
      repos: ["CorvidLabs/Corvidinho"],
      mentionUsername: "corvid-agent",
    });
    const types = new Set(events.map((e) => e.type));
    expect(types.has("issue_comment")).toBe(true);
    expect(types.has("issues")).toBe(true);
    expect(types.has("review_request")).toBe(true);
    expect(events.some((e) => e.id === "comment-9001")).toBe(true);
  });
});

describe("startWatchPoller fixture cycle", () => {
  const envBase = {
    GITHUB_TOKEN: "fake",
    CORVIDINHO_WATCH_USERNAME: "corvid-agent",
    CORVIDINHO_GITHUB_ALLOW_REPOS: "CorvidLabs/Corvidinho",
    CORVIDINHO_GITHUB_ALLOW_USERS: "0xLeif",
    CORVIDINHO_WATCH_DRY_RUN: "1",
  };

  test("allowlisted events start sessions; stranger comment refused", async () => {
    const actions: string[] = [];
    const result = await startWatchPoller({
      env: envBase,
      filePath: null,
      runLoop: false,
      agent: createEchoAgentClient(),
      searchClient: createFixtureSearchClient(bundle),
      onAction: (info) => {
        actions.push(`${info.kind}:${info.event.id}:${info.event.sender}`);
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const cycle = await result.pollOnce();
    expect(cycle.fetched).toBeGreaterThan(0);
    expect(cycle.started).toBeGreaterThanOrEqual(1);
    expect(actions.some((a) => a.includes("refuse") && a.includes("random-user"))).toBe(
      true,
    );
    expect(actions.some((a) => a.startsWith("start_session:"))).toBe(true);
    expect(result.store.bySessionId.size).toBeGreaterThanOrEqual(1);

    // Second cycle: all ids processed → no new starts
    const cycle2 = await result.pollOnce();
    expect(cycle2.started).toBe(0);
    expect(cycle2.continued).toBe(0);

    await result.stop();
  });

  test("injected fetchEvents path continues same issue session", async () => {
    let round = 0;
    const mk = (id: string): DetectedEvent => ({
      id,
      type: "issue_comment",
      body: "@corvid-agent ping",
      sender: "0xLeif",
      repo: "CorvidLabs/Corvidinho",
      number: 99,
      title: "cont",
      htmlUrl: "https://example.com/99",
      createdAt: "2026-09-26T12:00:00Z",
      isPullRequest: false,
    });
    const result = await startWatchPoller({
      env: envBase,
      filePath: null,
      runLoop: false,
      agent: createEchoAgentClient(),
      fetchEvents: async () => {
        round += 1;
        return [mk(round === 1 ? "c-a" : "c-b")];
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const c1 = await result.pollOnce();
    expect(c1.started).toBe(1);
    const c2 = await result.pollOnce();
    expect(c2.continued).toBe(1);
    expect(result.store.bySessionId.size).toBe(1);
    await result.stop();
  });
});

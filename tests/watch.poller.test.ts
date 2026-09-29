/**
 * WATCH poller fixture path — no live GitHub / webhook secrets.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createEchoAckClient } from "../src/watch/ack.ts";
import {
  createEchoAgentClient,
  type AgentClient,
} from "../src/watch/agent-client.ts";
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
  test("fetchWatchEvents finds comment, issue mention, review_request, assignment", async () => {
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
    expect(types.has("assignment")).toBe(true);
    expect(events.some((e) => e.id === "comment-9001")).toBe(true);
    expect(events.some((e) => e.id === "assign-CorvidLabs/Corvidinho#48")).toBe(
      true,
    );
    // Who assigned / requested rides along as `actor` (REQ-watch-302).
    const byId = new Map(events.map((e) => [e.id, e]));
    expect(byId.get("assign-CorvidLabs/Corvidinho#48")?.actor).toBe("0xLeif");
    expect(byId.get("reviewreq-CorvidLabs/Corvidinho#7")?.actor).toBe("0xLeif");
    expect(byId.get("comment-9001")?.actor).toBeUndefined();
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

// ALLOW-1/2 (REQ-watch-302): an assignment or review request is started by
// whoever assigned / requested, not by the thread author. Both must be
// allowlisted; otherwise no session, no ack and no run (ALLOW-5, quiet).
describe("assignment / review_request gate the user who assigned or requested", () => {
  const env = {
    GITHUB_TOKEN: "fake",
    CORVIDINHO_WATCH_USERNAME: "corvid-agent",
    CORVIDINHO_GITHUB_ALLOW_REPOS: "O/R",
    CORVIDINHO_GITHUB_ALLOW_USERS: "leif",
    CORVIDINHO_WATCH_DRY_RUN: "1",
  };

  /** PR O/R#8 and issue O/R#9, both by allowlisted leif; review of #8 requested, #9 assigned. */
  function bundleWith(
    actor: string | undefined,
    extra: Partial<FixtureBundle> = {},
  ): FixtureBundle {
    return {
      involving: [
        {
          number: 8,
          title: "Add cache",
          html_url: "https://github.com/O/R/pull/8",
          body: "ready",
          user: "leif",
          created_at: "2026-09-28T10:00:00Z",
          updated_at: "2026-09-28T12:00:00Z",
          pull_request: true,
          repo: "O/R",
          assignees: [],
        },
        {
          number: 9,
          title: "Fix flake",
          html_url: "https://github.com/O/R/issues/9",
          body: "please fix",
          user: "leif",
          created_at: "2026-09-28T10:00:00Z",
          updated_at: "2026-09-28T12:00:00Z",
          pull_request: false,
          repo: "O/R",
          assignees: ["corvid-agent"],
        },
      ],
      review_requests: { "o/r#8": ["corvid-agent"] },
      ...(actor
        ? {
            assigners: { "o/r#9": actor },
            review_requesters: { "o/r#8": actor },
          }
        : {}),
      ...extra,
    };
  }

  async function cycleOf(
    bundle: FixtureBundle,
    envOver: Record<string, string> = {},
  ) {
    const actions: string[] = [];
    const runs: string[] = [];
    const ack = createEchoAckClient();
    const agent: AgentClient = {
      async runChat({ prompt, sessionId }) {
        runs.push(prompt);
        return { ok: true, sessionId, summary: "done", exitCode: 0 };
      },
    };
    const result = await startWatchPoller({
      env: { ...env, ...envOver },
      filePath: null,
      runLoop: false,
      agent,
      ackClient: ack,
      searchClient: createFixtureSearchClient(bundle),
      log: () => {},
      onAction: (info) => actions.push(`${info.kind}:${info.event.id}`),
    });
    if (!result.ok) throw new Error(result.message);
    const cycle = await result.pollOnce();
    const sessions = result.store.bySessionId.size;
    await result.stop();
    return { cycle, actions: actions.sort(), runs, acks: ack.posts, sessions };
  }

  test("a non-allowlisted assigner / review requester is refused: no session, ack or run", async () => {
    const r = await cycleOf(bundleWith("bob"));
    expect(r.cycle.fetched).toBe(2);
    expect(r.cycle.started).toBe(0);
    expect(r.cycle.refused).toBe(2);
    expect(r.actions).toEqual(["refuse:assign-O/R#9", "refuse:reviewreq-O/R#8"]);
    expect(r.runs).toEqual([]);
    expect(r.acks).toEqual([]);
    expect(r.sessions).toBe(0);
  });

  test("an actor that could not be read is refused (fail closed)", async () => {
    const r = await cycleOf(bundleWith(undefined));
    expect(r.cycle.started).toBe(0);
    expect(r.cycle.refused).toBe(2);
    expect(r.runs).toEqual([]);
    expect(r.acks).toEqual([]);
    expect(r.sessions).toBe(0);
  });

  test("deny_users wins over an allowlisted actor", async () => {
    const r = await cycleOf(bundleWith("bob"), {
      CORVIDINHO_GITHUB_ALLOW_USERS: "leif,bob",
      CORVIDINHO_GITHUB_DENY_USERS: "bob",
    });
    expect(r.cycle.started).toBe(0);
    expect(r.cycle.refused).toBe(2);
    expect(r.runs).toEqual([]);
    expect(r.sessions).toBe(0);
  });

  test("an allowlisted actor still starts both sessions (no ack for these types)", async () => {
    const r = await cycleOf(bundleWith("leif"));
    expect(r.cycle.started).toBe(2);
    expect(r.cycle.refused).toBe(0);
    expect(r.actions).toEqual([
      "start_session:assign-O/R#9",
      "start_session:reviewreq-O/R#8",
    ]);
    expect(r.runs.length).toBe(2);
    expect(r.acks).toEqual([]);
    expect(r.sessions).toBe(2);
  });

  test("an untrusted newer assignment never shadows a trusted comment on the same issue", async () => {
    const r = await cycleOf(
      bundleWith("bob", {
        comments: {
          "o/r#9": [
            {
              id: 501,
              body: "@corvid-agent please take this",
              user: "leif",
              html_url: "https://github.com/O/R/issues/9#issuecomment-501",
              created_at: "2026-09-28T11:00:00Z",
            },
          ],
        },
      }),
    );
    expect(r.cycle.started).toBe(1);
    expect(r.cycle.refused).toBe(2);
    expect(r.actions).toContain("start_session:comment-501");
    expect(r.runs.length).toBe(1);
    expect(r.runs[0]).toContain("[WATCH issue_comment] O/R#9 by @leif");
  });
});

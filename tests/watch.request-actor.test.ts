/**
 * REQ-watch-302 — the live searcher reads who assigned the watch user or
 * requested its review from the issue's events, so the allowlist gate can
 * check that user (REQ-watch-302, ALLOW-1/2).
 *
 * A stubbed transport emulates GitHub (oldest-first, paginated issue events)
 * so createOctokitSearchClient runs for real; no token or network.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { GithubRateLimitError } from "../src/watch/rate-limit.ts";
import {
  createOctokitSearchClient,
  fetchWatchEvents,
  newestRequestActor,
  type IssueEventLike,
} from "../src/watch/searcher.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const user = (login: string) => ({ login });

function assigned(assignee: string, by: string, at: string): IssueEventLike {
  return {
    event: "assigned",
    created_at: at,
    actor: user(by),
    assignee: user(assignee),
    assigner: user(by),
  };
}

function reviewRequested(
  reviewer: string,
  by: string,
  at: string,
): IssueEventLike {
  return {
    event: "review_requested",
    created_at: at,
    actor: user(by),
    requested_reviewer: user(reviewer),
    review_requester: user(by),
  };
}

describe("newestRequestActor", () => {
  test("newest matching assigned event wins; other assignees and kinds are ignored", () => {
    const events: IssueEventLike[] = [
      assigned("corvid-agent", "leif", "2026-09-27T10:00:00Z"),
      { event: "unassigned", created_at: "2026-09-27T11:00:00Z", actor: user("bob"), assignee: user("corvid-agent") },
      assigned("corvid-agent", "bob", "2026-09-28T10:00:00Z"),
      assigned("someone-else", "leif", "2026-09-28T11:00:00Z"),
      reviewRequested("corvid-agent", "leif", "2026-09-28T12:00:00Z"),
    ];
    expect(newestRequestActor(events, "assigned", "Corvid-Agent")).toBe("bob");
    expect(newestRequestActor(events, "review_requested", "corvid-agent")).toBe("leif");
  });

  test("assigner / review_requester first, else the event actor", () => {
    expect(
      newestRequestActor(
        [{ event: "assigned", actor: user("leif"), assignee: user("corvid-agent") }],
        "assigned",
        "corvid-agent",
      ),
    ).toBe("leif");
    expect(
      newestRequestActor(
        [{ event: "review_requested", actor: user("x"), requested_reviewer: user("corvid-agent"), review_requester: user("bob") }],
        "review_requested",
        "corvid-agent",
      ),
    ).toBe("bob");
  });

  test("no matching event or no login → null", () => {
    expect(newestRequestActor([], "assigned", "corvid-agent")).toBeNull();
    expect(
      newestRequestActor(
        [{ event: "assigned", assignee: user("corvid-agent"), actor: null }],
        "assigned",
        "corvid-agent",
      ),
    ).toBeNull();
    // A team review request names no reviewer login.
    expect(
      newestRequestActor(
        [{ event: "review_requested", actor: user("leif"), review_requester: user("leif") }],
        "review_requested",
        "corvid-agent",
      ),
    ).toBeNull();
  });
});

type Stub = {
  events9?: IssueEventLike[];
  events8?: IssueEventLike[];
  eventsStatus?: number;
  eventsHeaders?: Record<string, string>;
};

/** GitHub search (PR o/r#8 review-requested, issue o/r#9 assigned) + issue events. */
function stubGithub(stub: Stub): string[] {
  const urls: string[] = [];
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  const pageOf = (url: URL, all: IssueEventLike[]) => {
    const perPage = Number(url.searchParams.get("per_page") ?? "30");
    const page = Number(url.searchParams.get("page") ?? "1");
    const headers: Record<string, string> = {};
    const lastPage = Math.max(1, Math.ceil(all.length / perPage));
    if (page < lastPage) {
      const next = new URL(url);
      next.searchParams.set("page", String(page + 1));
      const last = new URL(url);
      last.searchParams.set("page", String(lastPage));
      headers.link = `<${next}>; rel="next", <${last}>; rel="last"`;
    }
    return json(all.slice((page - 1) * perPage, page * perPage), 200, headers);
  };
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    urls.push(url.pathname + url.search);
    const p = url.pathname;
    if (p === "/search/issues") {
      return json({
        total_count: 2,
        incomplete_results: false,
        items: [
          {
            number: 8,
            title: "Add cache",
            html_url: "https://github.com/o/r/pull/8",
            body: "ready",
            user: user("leif"),
            created_at: "2026-09-28T10:00:00Z",
            updated_at: "2026-09-28T12:00:00Z",
            pull_request: { url: "https://api.github.com/repos/o/r/pulls/8" },
            assignees: [],
          },
          {
            number: 9,
            title: "Fix flake",
            html_url: "https://github.com/o/r/issues/9",
            body: "please fix",
            user: user("leif"),
            created_at: "2026-09-28T10:00:00Z",
            updated_at: "2026-09-28T12:00:00Z",
            assignees: [user("corvid-agent")],
          },
        ],
      });
    }
    if (p.endsWith("/comments")) return json([]);
    if (p === "/repos/o/r/pulls/8/requested_reviewers") {
      return json({ users: [user("corvid-agent")], teams: [] });
    }
    if (p === "/repos/o/r/issues/8/events" || p === "/repos/o/r/issues/9/events") {
      if (stub.eventsStatus && stub.eventsStatus !== 200) {
        return json({ message: "boom" }, stub.eventsStatus, stub.eventsHeaders);
      }
      return pageOf(url, (p.includes("/8/") ? stub.events8 : stub.events9) ?? []);
    }
    return json({ message: "Not Found" }, 404);
  }) as typeof fetch;
  return urls;
}

async function run() {
  return fetchWatchEvents({
    client: createOctokitSearchClient("fixture-token-not-real"),
    repos: ["o/r"],
    mentionUsername: "corvid-agent",
    sinceIso: "2026-09-27T00:00:00.000Z",
  });
}

describe("createOctokitSearchClient reads the actor from issue events (REQ-watch-302)", () => {
  test("assignment and review_request carry who assigned / requested, not the author", async () => {
    const urls = stubGithub({
      events9: [
        assigned("corvid-agent", "leif", "2026-09-27T10:00:00Z"),
        assigned("corvid-agent", "bob", "2026-09-28T11:00:00Z"),
      ],
      events8: [reviewRequested("corvid-agent", "bob", "2026-09-28T11:00:00Z")],
    });
    const events = await run();
    const byId = new Map(events.map((e) => [e.id, e]));
    expect(byId.get("assign-o/r#9")?.sender).toBe("leif");
    expect(byId.get("assign-o/r#9")?.actor).toBe("bob");
    expect(byId.get("reviewreq-o/r#8")?.sender).toBe("leif");
    expect(byId.get("reviewreq-o/r#8")?.actor).toBe("bob");
    expect(urls.some((u) => u.startsWith("/repos/o/r/issues/9/events"))).toBe(true);
    expect(urls.some((u) => u.startsWith("/repos/o/r/issues/8/events"))).toBe(true);
  });

  test("the newest assignment on a long event list (last page) is the one read", async () => {
    const filler: IssueEventLike[] = Array.from({ length: 230 }, (_, i) => ({
      event: "labeled",
      created_at: `2026-09-2${i < 115 ? 7 : 8}T00:00:00Z`,
      actor: user("leif"),
    }));
    const events9 = [
      assigned("corvid-agent", "leif", "2026-09-20T00:00:00Z"),
      ...filler,
      assigned("corvid-agent", "bob", "2026-09-28T12:00:00Z"),
    ];
    const urls = stubGithub({ events9, events8: [] });
    const events = await run();
    expect(events.find((e) => e.id === "assign-o/r#9")?.actor).toBe("bob");
    const pages = urls
      .filter((u) => u.startsWith("/repos/o/r/issues/9/events"))
      .map((u) => Number(new URL(u, "https://api.github.com").searchParams.get("page")));
    expect(pages).toEqual([1, 2, 3]);
  });

  test("an events read failure leaves no actor (the gate then refuses)", async () => {
    stubGithub({ eventsStatus: 500 });
    const events = await run();
    const assign = events.find((e) => e.id === "assign-o/r#9");
    const review = events.find((e) => e.id === "reviewreq-o/r#8");
    expect(assign).toBeDefined();
    expect(review).toBeDefined();
    expect(assign!.actor).toBeUndefined();
    expect(review!.actor).toBeUndefined();
  });

  test("a rate limit on the events read bubbles for poll backoff", async () => {
    stubGithub({
      eventsStatus: 403,
      eventsHeaders: {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 60),
      },
    });
    await expect(run()).rejects.toBeInstanceOf(GithubRateLimitError);
  });
});

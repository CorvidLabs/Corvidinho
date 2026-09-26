/**
 * REQ-watch-234 — live listComments must see the newest comments on a long thread.
 *
 * GitHub returns issue comments oldest-first and honors per_page/page/since.
 * A stubbed transport emulates that so createOctokitSearchClient runs for real.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { createOctokitSearchClient, fetchWatchEvents } from "../src/watch/searcher.ts";

const API = "https://api.github.com";
const SINCE = "2026-09-24T00:00:00.000Z";
const OLD = "2026-09-10T12:00:00Z";
const RECENT = "2026-09-25T12:00:00Z";
const MENTION = "@corvid-agent please fix the flaky test";

type Comment = { id: number; body: string; login: string; at: string };

function thread(total: number, oldCount: number): Comment[] {
  const out: Comment[] = [];
  for (let i = 1; i <= total; i++) {
    out.push({
      id: 999 + i,
      body: i === total ? MENTION : `chatter ${i}`,
      login: "0xLeif",
      at: i <= oldCount ? OLD : RECENT,
    });
  }
  return out;
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Emulate GitHub search + ascending, paginated, since-filtered issue comments. */
function stubGithub(comments: Comment[]): string[] {
  const urls: string[] = [];
  const json = (body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json", ...headers },
    });
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    urls.push(url.pathname + url.search);
    if (url.pathname === "/search/issues") {
      return json({
        total_count: 1,
        incomplete_results: false,
        items: [
          {
            number: 7,
            title: "Tracking: flaky tests",
            html_url: "https://github.com/corvidlabs/app/issues/7",
            body: "long-running tracker",
            user: { login: "0xLeif" },
            created_at: OLD,
            updated_at: RECENT,
            assignees: [],
          },
        ],
      });
    }
    if (url.pathname === "/repos/corvidlabs/app/issues/7/comments") {
      const perPage = Number(url.searchParams.get("per_page") ?? "30");
      const page = Number(url.searchParams.get("page") ?? "1");
      const since = url.searchParams.get("since");
      const matching = since
        ? comments.filter((c) => Date.parse(c.at) >= Date.parse(since))
        : comments;
      const slice = matching.slice((page - 1) * perPage, page * perPage);
      const headers: Record<string, string> = {};
      if (page * perPage < matching.length) {
        const next = new URL(url);
        next.searchParams.set("page", String(page + 1));
        headers.link = `<${next.toString()}>; rel="next"`;
      }
      return json(
        slice.map((c) => ({
          id: c.id,
          body: c.body,
          user: { login: c.login },
          html_url: `https://github.com/corvidlabs/app/issues/7#issuecomment-${c.id}`,
          created_at: c.at,
          updated_at: c.at,
        })),
        headers,
      );
    }
    return new Response(JSON.stringify({ message: "Not Found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return urls;
}

async function run() {
  return fetchWatchEvents({
    client: createOctokitSearchClient("fixture-token-not-real"),
    repos: ["corvidlabs/app"],
    mentionUsername: "corvid-agent",
    sinceIso: SINCE,
  });
}

describe("WATCH listComments on long threads (REQ-watch-234)", () => {
  test("newest @mention after comment #50 on an old tracker is detected", async () => {
    const urls = stubGithub(thread(60, 59));
    const events = await run();
    const hit = events.find((e) => e.id === "comment-1059");
    expect(hit).toBeDefined();
    expect(hit!.type).toBe("issue_comment");
    expect(hit!.body).toBe(MENTION);
    expect(hit!.sender).toBe("0xLeif");
    // The comments request is bounded by the same window as the search.
    const commentUrls = urls.filter((u) => u.includes("/issues/7/comments"));
    expect(commentUrls.length).toBeGreaterThan(0);
    expect(commentUrls.every((u) => u.includes(`since=${encodeURIComponent(SINCE)}`))).toBe(true);
  });

  test("busy thread with more than one page inside the window is paginated", async () => {
    const urls = stubGithub(thread(150, 0));
    const events = await run();
    expect(events.map((e) => e.id)).toContain("comment-1149");
    const commentUrls = urls.filter((u) => u.includes("/issues/7/comments"));
    expect(commentUrls.length).toBe(2);
  });

  test("comments older than the window are not fetched", async () => {
    const comments = thread(3, 3);
    comments[0]!.body = "@corvid-agent stale ping from two weeks ago";
    stubGithub(comments);
    const events = await run();
    expect(events.filter((e) => e.type === "issue_comment")).toEqual([]);
  });
});

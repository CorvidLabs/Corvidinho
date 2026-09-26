/**
 * WATCH searcher — injectable client; Octokit live path; fixtures for CI.
 * Steals DetectedMention shapes from corvid-agent; uses typed API not shell gh.
 * Assignment events: when watch username is in issue/PR assignees (#48).
 * Own watch-username mentions/comments skipped (REQ-watch-007).
 * Search per_page=100; org-wide results can still bury pings beyond one page.
 */

import { Octokit } from "@octokit/rest";
import { asGithubRateLimitError } from "./rate-limit.ts";
import type { DetectedEvent, DetectedEventType } from "./types.ts";

export function containsMention(body: string, username: string): boolean {
  if (!body || !username) return false;
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^\\w])@${escaped}\\b`, "i");
  return re.test(body);
}

export type SearchClient = {
  /** Search issues/PRs involving the username in a repo qualifier. */
  searchInvolving(
    repoQualifier: string,
    username: string,
    sinceDate: string,
  ): Promise<Array<{
    number: number;
    title: string;
    htmlUrl: string;
    body: string;
    user: string;
    createdAt: string;
    updatedAt: string;
    isPullRequest: boolean;
    repo: string;
    assignees: string[];
  }>>;
  listComments(
    owner: string,
    repo: string,
    number: number,
  ): Promise<Array<{
    id: number;
    body: string;
    user: string;
    htmlUrl: string;
    createdAt: string;
  }>>;
  listReviewRequests(
    owner: string,
    repo: string,
    number: number,
  ): Promise<string[]>;
};

export type FixtureBundle = {
  involving?: Array<{
    number: number;
    title: string;
    html_url: string;
    body?: string;
    user?: string;
    created_at?: string;
    updated_at?: string;
    pull_request?: boolean;
    repo: string;
    assignees?: string[];
  }>;
  comments?: Record<
    string,
    Array<{
      id: number;
      body: string;
      user: string;
      html_url: string;
      created_at: string;
    }>
  >;
  review_requests?: Record<string, string[]>;
};

/** Fixture search client for tests / offline CI. */
export function createFixtureSearchClient(bundle: FixtureBundle): SearchClient {
  return {
    async searchInvolving(repoQualifier, _username, _sinceDate) {
      const items = bundle.involving ?? [];
      return items
        .filter((it) => {
          if (repoQualifier.endsWith("/*")) {
            const org = repoQualifier.slice(0, -2).toLowerCase();
            return it.repo.toLowerCase().startsWith(org + "/");
          }
          return it.repo.toLowerCase() === repoQualifier.toLowerCase();
        })
        .map((it) => ({
          number: it.number,
          title: it.title,
          htmlUrl: it.html_url,
          body: it.body ?? "",
          user: it.user ?? "unknown",
          createdAt: it.created_at ?? new Date().toISOString(),
          updatedAt: it.updated_at ?? it.created_at ?? new Date().toISOString(),
          isPullRequest: !!it.pull_request,
          repo: it.repo,
          assignees: it.assignees ?? [],
        }));
    },
    async listComments(owner, repo, number) {
      const key = `${owner}/${repo}#${number}`.toLowerCase();
      const list = bundle.comments?.[key] ?? [];
      return list.map((c) => ({
        id: c.id,
        body: c.body,
        user: c.user,
        htmlUrl: c.html_url,
        createdAt: c.created_at,
      }));
    },
    async listReviewRequests(owner, repo, number) {
      const key = `${owner}/${repo}#${number}`.toLowerCase();
      return bundle.review_requests?.[key] ?? [];
    },
  };
}

async function withRateLimitRethrow<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const rl = asGithubRateLimitError(err);
    if (rl) throw rl;
    throw err;
  }
}

export function createOctokitSearchClient(token: string): SearchClient {
  const octokit = new Octokit({ auth: token, userAgent: "corvidinho-watch" });
  return {
    async searchInvolving(repoQualifier, username, sinceDate) {
      return withRateLimitRethrow(async () => {
        const day = sinceDate.split("T")[0] ?? sinceDate;
        const q = repoQualifier.endsWith("/*")
          ? `org:${repoQualifier.slice(0, -2)} involves:${username} updated:>=${day}`
          : `repo:${repoQualifier} involves:${username} updated:>=${day}`;
        const res = await octokit.rest.search.issuesAndPullRequests({
          q,
          sort: "updated",
          order: "desc",
          per_page: 100,
        });
        return (res.data.items ?? []).map((it) => {
          const htmlUrl = it.html_url ?? "";
          const repo =
            htmlUrl.match(/github\.com\/([^/]+\/[^/]+)\//)?.[1] ??
            (repoQualifier.endsWith("/*") ? "unknown/unknown" : repoQualifier);
          return {
            number: it.number,
            title: it.title ?? "",
            htmlUrl,
            body: it.body ?? "",
            user: it.user?.login ?? "unknown",
            createdAt: it.created_at,
            updatedAt: it.updated_at,
            isPullRequest: !!it.pull_request,
            repo,
            assignees: (it.assignees ?? [])
              .map((a) => a?.login)
              .filter((x): x is string => !!x),
          };
        });
      });
    },
    async listComments(owner, repo, number) {
      return withRateLimitRethrow(async () => {
        const res = await octokit.rest.issues.listComments({
          owner,
          repo,
          issue_number: number,
          per_page: 50,
        });
        return res.data.map((c) => ({
          id: c.id,
          body: c.body ?? "",
          user: c.user?.login ?? "unknown",
          htmlUrl: c.html_url,
          createdAt: c.created_at,
        }));
      });
    },
    async listReviewRequests(owner, repo, number) {
      try {
        return await withRateLimitRethrow(async () => {
          const res = await octokit.rest.pulls.listRequestedReviewers({
            owner,
            repo,
            pull_number: number,
          });
          return (res.data.users ?? []).map((u) => u.login);
        });
      } catch (err) {
        // Non-rate-limit failures stay quiet (PR may not exist); rate-limit bubbles.
        const rl = asGithubRateLimitError(err);
        if (rl) throw rl;
        return [];
      }
    },
  };
}

function splitRepo(repo: string): { owner: string; name: string } | null {
  const parts = repo.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], name: parts[1] };
}

/**
 * Fetch + normalize mention/review events for configured repo qualifiers.
 */
export async function fetchWatchEvents(opts: {
  client: SearchClient;
  repos: string[];
  mentionUsername: string;
  sinceIso?: string;
}): Promise<DetectedEvent[]> {
  const since =
    opts.sinceIso ??
    new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const events: DetectedEvent[] = [];
  const username = opts.mentionUsername;

  for (const repoQ of opts.repos) {
    const items = await opts.client.searchInvolving(repoQ, username, since);
    for (const item of items) {
      const parts = splitRepo(item.repo);
      if (!parts) continue;

      // Issue/PR body mention (skip own watch-username — REQ-watch-007)
      if (
        containsMention(item.body, username) &&
        item.user.toLowerCase() !== username.toLowerCase()
      ) {
        events.push({
          id: `issue-${item.repo}#${item.number}`,
          type: "issues",
          body: item.body,
          sender: item.user,
          repo: item.repo,
          number: item.number,
          title: item.title,
          htmlUrl: item.htmlUrl,
          createdAt: item.createdAt,
          isPullRequest: item.isPullRequest,
        });
      }

      // Assignment (assignee ingress for dogfood tag/assign → work)
      if (
        item.assignees.some(
          (a) => a.toLowerCase() === username.toLowerCase(),
        )
      ) {
        events.push({
          id: `assign-${item.repo}#${item.number}`,
          type: "assignment",
          body: item.body || `assigned to @${username}`,
          sender: item.user,
          repo: item.repo,
          number: item.number,
          title: item.title,
          htmlUrl: item.htmlUrl,
          createdAt: item.updatedAt,
          isPullRequest: item.isPullRequest,
        });
      }

      // Comments mentioning us
      const comments = await opts.client.listComments(
        parts.owner,
        parts.name,
        item.number,
      );
      for (const c of comments) {
        if (!containsMention(c.body, username)) continue;
        // Skip own comments (no self-loop on acks / chatter) — REQ-watch-007
        if (c.user.toLowerCase() === username.toLowerCase()) continue;
        events.push({
          id: `comment-${c.id}`,
          type: "issue_comment",
          body: c.body,
          sender: c.user,
          repo: item.repo,
          number: item.number,
          title: item.title,
          htmlUrl: c.htmlUrl,
          createdAt: c.createdAt,
          isPullRequest: item.isPullRequest,
        });
      }

      // Review requests on PRs
      if (item.isPullRequest) {
        const requested = await opts.client.listReviewRequests(
          parts.owner,
          parts.name,
          item.number,
        );
        if (
          requested.some((u) => u.toLowerCase() === username.toLowerCase())
        ) {
          events.push({
            id: `reviewreq-${item.repo}#${item.number}`,
            type: "review_request",
            body: `review requested of @${username}`,
            sender: item.user,
            repo: item.repo,
            number: item.number,
            title: item.title,
            htmlUrl: item.htmlUrl,
            createdAt: item.updatedAt,
            isPullRequest: true,
          });
        }
      }
    }
  }

  events.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return events;
}

export type { DetectedEventType };

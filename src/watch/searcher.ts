/**
 * WATCH searcher — injectable client; Octokit live path; fixtures for CI.
 * Steals DetectedMention shapes from corvid-agent; uses typed API not shell gh.
 * Assignment events: when watch username is in issue/PR assignees (#48).
 * Own watch-username mentions/comments skipped (REQ-watch-007).
 * Search per_page=100; org-wide results can still bury pings beyond one page.
 * Issue/PR comments: `since` = poll window, 100 per page, page 1 plus the
 * newest pages up to MAX_COMMENT_PAGES (REQ-watch-234) so a new @mention on a
 * long thread is not hidden behind the oldest comments.
 * Assignment / review-request events carry `actor`: who assigned the watch
 * user or requested its review, read from the issue's events (REQ-watch-302).
 * IDENTITY-12.a / SAFE-13 (REQ-watch-1202): comment and issue-body events
 * carry who edited the triggering text after it was posted
 * (`textEditorIds`, read from its GraphQL edit history for every comment and
 * body — REST `updated_at` is to the second, so an edit made in the second
 * the text was posted would look unedited; unreadable ⇒ absent); every event
 * carries the thread author's numeric id (`threadAuthorId`) and who renamed
 * the thread's title (`titleEditorIds`, its GraphQL rename events;
 * unreadable ⇒ absent). The lookups are made only for events the caller has
 * not handled yet (`needsLookup`), so each is one GraphQL call, once.
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
    /** GitHub numeric id of `user` when known (IDENTITY-7). */
    userId?: number;
    /** GraphQL node id of the issue / PR, for its body's edit history (REQ-watch-1202). */
    nodeId?: string;
    createdAt: string;
    updatedAt: string;
    isPullRequest: boolean;
    repo: string;
    assignees: string[];
  }>>;
  /** Comments updated at/after `since` (ISO) when given — REQ-watch-234. */
  listComments(
    owner: string,
    repo: string,
    number: number,
    since?: string,
  ): Promise<Array<{
    id: number;
    body: string;
    user: string;
    /** GitHub numeric id of `user` when known (IDENTITY-7). */
    userId?: number;
    /** GraphQL node id of the comment, for its edit history (REQ-watch-1202). */
    nodeId?: string;
    htmlUrl: string;
    createdAt: string;
    /** When the comment was last updated (edits are read from GraphQL, never from this; REQ-watch-1202). */
    updatedAt?: string;
  }>>;
  listReviewRequests(
    owner: string,
    repo: string,
    number: number,
  ): Promise<string[]>;
  /**
   * Login of the user who made the newest `kind` event naming `username`
   * (assigned it / requested its review), or null when none can be read
   * (REQ-watch-302). Null is refused by the allowlist gate (fail closed).
   */
  findRequestActor(
    owner: string,
    repo: string,
    number: number,
    kind: RequestActorKind,
    username: string,
  ): Promise<string | null>;
  /**
   * GitHub numeric user ids of everyone who edited this comment or issue /
   * PR body (GraphQL `nodeId`) after it was posted — `[]` when never edited
   * — or null when that cannot be read (REQ-watch-1202). Absent ⇒ unknown.
   */
  findTextEditors?(nodeId: string): Promise<number[] | null>;
  /**
   * GitHub numeric user ids of everyone who renamed this issue's or PR's
   * title (GraphQL `nodeId` of the thread) — `[]` when never renamed — or
   * null when that cannot be read (SAFE-13, REQ-watch-1202). Absent ⇒ unknown.
   */
  findTitleEditors?(nodeId: string): Promise<number[] | null>;
};

/**
 * GraphQL for one comment's or issue / PR body's edit history (REQ-watch-1202):
 * the last editor and every kept revision's editor (and who deleted one).
 */
export const TEXT_EDITORS_QUERY = `query($id: ID!) {
  node(id: $id) {
    ... on Comment {
      lastEditedAt
      editor { ...EditorId }
      userContentEdits(first: 100) {
        totalCount
        nodes { editor { ...EditorId } deletedBy { ...EditorId } }
      }
    }
  }
}
fragment EditorId on Actor {
  ... on User { databaseId }
  ... on Bot { databaseId }
  ... on Mannequin { databaseId }
}`;

function actorDatabaseId(actor: unknown): number | null {
  if (!actor || typeof actor !== "object") return null;
  const id = (actor as { databaseId?: unknown }).databaseId;
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * The editors' GitHub numeric ids from a {@link TEXT_EDITORS_QUERY} `node`
 * (REQ-watch-1202): `[]` when it was never edited; null (unknown) when the
 * node is missing, an edit's editor (or a revision's deleter) has no
 * numeric id, or the history has more revisions than were read.
 */
export function textEditorIdsFromNode(node: unknown): number[] | null {
  if (!node || typeof node !== "object") return null;
  const n = node as {
    lastEditedAt?: unknown;
    editor?: unknown;
    userContentEdits?: { totalCount?: unknown; nodes?: unknown } | null;
  };
  const edits = n.userContentEdits;
  if (!edits || typeof edits !== "object") return null;
  const nodes = Array.isArray(edits.nodes) ? edits.nodes : null;
  if (!nodes || typeof edits.totalCount !== "number" || edits.totalCount > nodes.length) return null;
  const ids = new Set<number>();
  if (n.lastEditedAt != null) {
    const id = actorDatabaseId(n.editor);
    if (id === null) return null;
    ids.add(id);
  }
  for (const e of nodes) {
    if (!e || typeof e !== "object") return null;
    const rev = e as { editor?: unknown; deletedBy?: unknown };
    const id = actorDatabaseId(rev.editor);
    if (id === null) return null;
    ids.add(id);
    if (rev.deletedBy != null) {
      const by = actorDatabaseId(rev.deletedBy);
      if (by === null) return null;
      ids.add(by);
    }
  }
  return [...ids];
}

/**
 * GraphQL for who renamed an issue's or PR's title (SAFE-13, REQ-watch-1202):
 * every `RenamedTitleEvent`'s actor.
 */
export const TITLE_EDITORS_QUERY = `query($id: ID!) {
  node(id: $id) {
    ... on Issue {
      issueRenames: timelineItems(itemTypes: [RENAMED_TITLE_EVENT], first: 100) {
        totalCount
        nodes { ... on RenamedTitleEvent { actor { ...EditorId } } }
      }
    }
    ... on PullRequest {
      prRenames: timelineItems(itemTypes: [RENAMED_TITLE_EVENT], first: 100) {
        totalCount
        nodes { ... on RenamedTitleEvent { actor { ...EditorId } } }
      }
    }
  }
}
fragment EditorId on Actor {
  ... on User { databaseId }
  ... on Bot { databaseId }
  ... on Mannequin { databaseId }
}`;

/**
 * The renamers' GitHub numeric ids from a {@link TITLE_EDITORS_QUERY} `node`
 * (SAFE-13, REQ-watch-1202): `[]` when the title was never renamed; null
 * (unknown) when the node is missing or neither an issue nor a PR, a rename's
 * actor has no numeric id, or there are more renames than were read.
 */
export function titleEditorIdsFromNode(node: unknown): number[] | null {
  if (!node || typeof node !== "object") return null;
  const n = node as { issueRenames?: unknown; prRenames?: unknown };
  const renames = (n.issueRenames ?? n.prRenames) as { totalCount?: unknown; nodes?: unknown } | null | undefined;
  if (!renames || typeof renames !== "object") return null;
  const nodes = Array.isArray(renames.nodes) ? renames.nodes : null;
  if (!nodes || typeof renames.totalCount !== "number" || renames.totalCount > nodes.length) return null;
  const ids = new Set<number>();
  for (const e of nodes) {
    if (!e || typeof e !== "object") return null;
    const id = actorDatabaseId((e as { actor?: unknown }).actor);
    if (id === null) return null;
    ids.add(id);
  }
  return [...ids];
}

/** Issue event kinds whose actor gates an assignment / review_request event. */
export type RequestActorKind = "assigned" | "review_requested";

/** The fields of a GitHub issue event that name who did what to whom. */
export type IssueEventLike = {
  event?: string | null;
  created_at?: string | null;
  actor?: { login?: string | null } | null;
  assignee?: { login?: string | null } | null;
  assigner?: { login?: string | null } | null;
  requested_reviewer?: { login?: string | null } | null;
  review_requester?: { login?: string | null } | null;
};

/**
 * Who made the newest `assigned` (or `review_requested`) event whose assignee
 * (requested reviewer) is `username`: `assigner` (`review_requester`), else the
 * event's `actor`. Null when no such event or no login (REQ-watch-302).
 */
export function newestRequestActor(
  events: IssueEventLike[],
  kind: RequestActorKind,
  username: string,
): string | null {
  const want = username.trim().toLowerCase();
  if (!want) return null;
  let best: { at: number; login: string | null } | null = null;
  for (const e of events) {
    if (e?.event !== kind) continue;
    const target = kind === "assigned" ? e.assignee : e.requested_reviewer;
    if ((target?.login ?? "").toLowerCase() !== want) continue;
    const by = kind === "assigned" ? e.assigner : e.review_requester;
    const at = Date.parse(e.created_at ?? "") || 0;
    // Oldest-first list: on equal times the later entry is the newer one.
    if (!best || at >= best.at) {
      best = { at, login: by?.login || e.actor?.login || null };
    }
  }
  return best?.login ?? null;
}

export type FixtureBundle = {
  involving?: Array<{
    number: number;
    title: string;
    html_url: string;
    body?: string;
    user?: string;
    user_id?: number;
    created_at?: string;
    updated_at?: string;
    pull_request?: boolean;
    repo: string;
    assignees?: string[];
    /** Who edited the body after it was posted (REQ-watch-1202); default never edited. */
    body_editor_ids?: number[];
    /** Who renamed the title (REQ-watch-1202); default never renamed. */
    title_editor_ids?: number[];
  }>;
  comments?: Record<
    string,
    Array<{
      id: number;
      body: string;
      user: string;
      user_id?: number;
      html_url: string;
      created_at: string;
      /** Default `created_at` (never edited). */
      updated_at?: string;
      /** Who edited it after it was posted (REQ-watch-1202); default nobody. */
      editor_ids?: number[];
    }>
  >;
  review_requests?: Record<string, string[]>;
  /** `owner/repo#n` (lowercase) → who assigned the watch user (REQ-watch-302). */
  assigners?: Record<string, string>;
  /** `owner/repo#n` (lowercase) → who requested its review (REQ-watch-302). */
  review_requesters?: Record<string, string>;
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
          ...(it.user_id !== undefined ? { userId: it.user_id } : {}),
          nodeId: fixtureIssueNodeId(it.repo, it.number),
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
        ...(c.user_id !== undefined ? { userId: c.user_id } : {}),
        nodeId: fixtureCommentNodeId(c.id),
        htmlUrl: c.html_url,
        createdAt: c.created_at,
        updatedAt: c.updated_at ?? c.created_at,
      }));
    },
    async listReviewRequests(owner, repo, number) {
      const key = `${owner}/${repo}#${number}`.toLowerCase();
      return bundle.review_requests?.[key] ?? [];
    },
    async findRequestActor(owner, repo, number, kind) {
      const key = `${owner}/${repo}#${number}`.toLowerCase();
      const map =
        kind === "assigned" ? bundle.assigners : bundle.review_requesters;
      return map?.[key] ?? null;
    },
    async findTextEditors(nodeId) {
      for (const it of bundle.involving ?? []) {
        if (fixtureIssueNodeId(it.repo, it.number) === nodeId) return it.body_editor_ids ?? [];
      }
      for (const list of Object.values(bundle.comments ?? {})) {
        for (const c of list) {
          if (fixtureCommentNodeId(c.id) === nodeId) return c.editor_ids ?? [];
        }
      }
      return null;
    },
    async findTitleEditors(nodeId) {
      for (const it of bundle.involving ?? []) {
        if (fixtureIssueNodeId(it.repo, it.number) === nodeId) return it.title_editor_ids ?? [];
      }
      return null;
    },
  };
}

function fixtureIssueNodeId(repo: string, number: number): string {
  return `fixture-issue-${repo.toLowerCase()}#${number}`;
}

function fixtureCommentNodeId(id: number): string {
  return `fixture-comment-${id}`;
}

/** Page size and page cap for one issue's comments (or events) list. */
const COMMENT_PAGE_SIZE = 100;
const MAX_COMMENT_PAGES = 10;

/** Page number of a GitHub `Link` header relation (`next` / `last`), if any. */
function linkPage(
  link: string | undefined,
  rel: "next" | "last",
): number | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    if (!part.includes(`rel="${rel}"`)) continue;
    const href = part.match(/<([^>]+)>/)?.[1];
    if (!href) continue;
    try {
      const page = Number(new URL(href).searchParams.get("page"));
      if (Number.isInteger(page) && page >= 1) return page;
    } catch {
      // Malformed URL: treat as absent.
    }
  }
  return null;
}

/**
 * GitHub lists an issue's comments and events oldest-first and cannot sort
 * descending: read page 1 plus the NEWEST pages up to the cap (via
 * rel="last"; rel="next" when there is no last), so a long thread cannot hide
 * the newest entries. Returned in page order (oldest-first).
 */
async function readFirstAndNewestPages<T>(
  get: (page: number) => Promise<{ data: T[]; headers: { link?: string } }>,
): Promise<T[]> {
  const first = await get(1);
  const raw = [...first.data];
  const last = linkPage(first.headers.link, "last");
  if (last !== null) {
    const from = Math.max(2, last - MAX_COMMENT_PAGES + 2);
    for (let page = from; page <= last; page++) {
      raw.push(...(await get(page)).data);
    }
  } else {
    // No rel="last": follow rel="next" up to the cap.
    let next = linkPage(first.headers.link, "next");
    for (let pages = 1; next !== null && pages < MAX_COMMENT_PAGES; pages++) {
      const res = await get(next);
      raw.push(...res.data);
      next = linkPage(res.headers.link, "next");
    }
  }
  return raw;
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
            ...(typeof it.user?.id === "number" ? { userId: it.user.id } : {}),
            ...(typeof it.node_id === "string" && it.node_id ? { nodeId: it.node_id } : {}),
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
    async listComments(owner, repo, number, since) {
      return withRateLimitRethrow(async () => {
        // Bound by `since`, then page 1 plus the NEWEST pages, so a flood of
        // older comments inside the window cannot hide the newest @mention.
        const raw = await readFirstAndNewestPages((page) =>
          octokit.rest.issues.listComments({
            owner,
            repo,
            issue_number: number,
            per_page: COMMENT_PAGE_SIZE,
            page,
            ...(since ? { since } : {}),
          }),
        );
        return raw.map((c) => ({
          id: c.id,
          body: c.body ?? "",
          user: c.user?.login ?? "unknown",
          ...(typeof c.user?.id === "number" ? { userId: c.user.id } : {}),
          ...(typeof c.node_id === "string" && c.node_id ? { nodeId: c.node_id } : {}),
          htmlUrl: c.html_url,
          createdAt: c.created_at,
          ...(typeof c.updated_at === "string" ? { updatedAt: c.updated_at } : {}),
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
    async findRequestActor(owner, repo, number, kind, username) {
      try {
        return await withRateLimitRethrow(async () => {
          const events = await readFirstAndNewestPages((page) =>
            octokit.rest.issues.listEvents({
              owner,
              repo,
              issue_number: number,
              per_page: COMMENT_PAGE_SIZE,
              page,
            }),
          );
          return newestRequestActor(
            events as IssueEventLike[],
            kind,
            username,
          );
        });
      } catch (err) {
        // Rate-limit bubbles; any other failure means "actor unknown", which
        // the allowlist gate refuses (fail closed, REQ-watch-302).
        const rl = asGithubRateLimitError(err);
        if (rl) throw rl;
        return null;
      }
    },
    async findTextEditors(nodeId) {
      try {
        return await withRateLimitRethrow(async () => {
          const res = await octokit.graphql<{ node?: unknown }>(TEXT_EDITORS_QUERY, { id: nodeId });
          return textEditorIdsFromNode(res?.node);
        });
      } catch (err) {
        // Rate-limit bubbles; any other failure means "editors unknown", which
        // gives the run community tools (fail closed, REQ-watch-1202).
        const rl = asGithubRateLimitError(err);
        if (rl) throw rl;
        return null;
      }
    },
    async findTitleEditors(nodeId) {
      try {
        return await withRateLimitRethrow(async () => {
          const res = await octokit.graphql<{ node?: unknown }>(TITLE_EDITORS_QUERY, { id: nodeId });
          return titleEditorIdsFromNode(res?.node);
        });
      } catch (err) {
        // Rate-limit bubbles; any other failure means "renamers unknown", so
        // the title is scanned (SAFE-13, fail closed, REQ-watch-1202).
        const rl = asGithubRateLimitError(err);
        if (rl) throw rl;
        return null;
      }
    },
  };
}

/** Who edited a text by its GraphQL node id; null when unknown (REQ-watch-1202). */
async function editorsOf(client: SearchClient, nodeId: string | undefined): Promise<number[] | null> {
  if (!nodeId || !client.findTextEditors) return null;
  return client.findTextEditors(nodeId);
}

/** Who renamed a thread's title by its GraphQL node id; null when unknown (REQ-watch-1202). */
async function titleEditorsOf(client: SearchClient, nodeId: string | undefined): Promise<number[] | null> {
  if (!nodeId || !client.findTitleEditors) return null;
  return client.findTitleEditors(nodeId);
}

function splitRepo(repo: string): { owner: string; name: string } | null {
  const parts = repo.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], name: parts[1] };
}

/**
 * Fetch + normalize mention/review events for configured repo qualifiers.
 * `needsLookup(eventId)` (default: every event) says which events still need
 * their edit and rename lookups (REQ-watch-1202): the poller skips the ids it
 * already handled, so the lookups are made once per new event, not every
 * poll; a skipped event carries neither (unknown, which only lowers a role).
 */
export async function fetchWatchEvents(opts: {
  client: SearchClient;
  repos: string[];
  mentionUsername: string;
  sinceIso?: string;
  needsLookup?: (eventId: string) => boolean;
}): Promise<DetectedEvent[]> {
  const since =
    opts.sinceIso ??
    new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const events: DetectedEvent[] = [];
  const username = opts.mentionUsername;
  const needsLookup = opts.needsLookup ?? (() => true);

  for (const repoQ of opts.repos) {
    const items = await opts.client.searchInvolving(repoQ, username, since);
    for (const item of items) {
      const parts = splitRepo(item.repo);
      if (!parts) continue;
      // SAFE-13 (REQ-watch-1202): who wrote the thread's title, and who
      // renamed it (read once per thread, only for an event still to handle).
      const threadAuthor = item.userId !== undefined ? { threadAuthorId: item.userId } : {};
      let renamers: Promise<number[] | null> | undefined;
      const titleEditors = async (eventId: string): Promise<{ titleEditorIds?: number[] }> => {
        if (!needsLookup(eventId)) return {};
        renamers ??= titleEditorsOf(opts.client, item.nodeId);
        const ids = await renamers;
        return ids ? { titleEditorIds: ids } : {};
      };

      // Issue/PR body mention (skip own watch-username — REQ-watch-007)
      if (
        containsMention(item.body, username) &&
        item.user.toLowerCase() !== username.toLowerCase()
      ) {
        const id = `issue-${item.repo}#${item.number}`;
        // IDENTITY-12.a (REQ-watch-1202): who edited the body after it was posted.
        const bodyEditors = needsLookup(id) ? await editorsOf(opts.client, item.nodeId) : null;
        events.push({
          id,
          type: "issues",
          body: item.body,
          sender: item.user,
          ...(item.userId !== undefined ? { senderId: item.userId } : {}),
          ...(bodyEditors ? { textEditorIds: bodyEditors } : {}),
          ...threadAuthor,
          ...(await titleEditors(id)),
          repo: item.repo,
          number: item.number,
          title: item.title,
          htmlUrl: item.htmlUrl,
          createdAt: item.createdAt,
          isPullRequest: item.isPullRequest,
        });
      }

      // Assignment (assignee ingress for dogfood tag/assign → work). `actor`
      // is who assigned us; the gate checks it too (REQ-watch-302).
      if (
        item.assignees.some(
          (a) => a.toLowerCase() === username.toLowerCase(),
        )
      ) {
        const actor = await opts.client.findRequestActor(
          parts.owner,
          parts.name,
          item.number,
          "assigned",
          username,
        );
        const id = `assign-${item.repo}#${item.number}`;
        events.push({
          id,
          type: "assignment",
          body: item.body || `assigned to @${username}`,
          sender: item.user,
          ...(item.userId !== undefined ? { senderId: item.userId } : {}),
          ...threadAuthor,
          ...(await titleEditors(id)),
          ...(actor ? { actor } : {}),
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
        since,
      );
      for (const c of comments) {
        if (!containsMention(c.body, username)) continue;
        // Skip own comments (no self-loop on acks / chatter) — REQ-watch-007
        if (c.user.toLowerCase() === username.toLowerCase()) continue;
        const id = `comment-${c.id}`;
        // IDENTITY-12.a (REQ-watch-1202): who edited it after it was posted,
        // always from its edit history — never from `updated_at`, which is to
        // the second (unknown ⇒ absent).
        const commentEditors = needsLookup(id) ? await editorsOf(opts.client, c.nodeId) : null;
        events.push({
          id,
          type: "issue_comment",
          body: c.body,
          sender: c.user,
          ...(c.userId !== undefined ? { senderId: c.userId } : {}),
          ...(commentEditors ? { textEditorIds: commentEditors } : {}),
          ...threadAuthor,
          ...(await titleEditors(id)),
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
          const actor = await opts.client.findRequestActor(
            parts.owner,
            parts.name,
            item.number,
            "review_requested",
            username,
          );
          const id = `reviewreq-${item.repo}#${item.number}`;
          events.push({
            id,
            type: "review_request",
            body: `review requested of @${username}`,
            sender: item.user,
            ...(item.userId !== undefined ? { senderId: item.userId } : {}),
            ...threadAuthor,
            ...(await titleEditors(id)),
            ...(actor ? { actor } : {}),
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

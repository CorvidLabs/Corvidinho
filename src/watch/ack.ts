/**
 * WATCH auto-ack — short GitHub issue comment when a session starts/continues
 * from a mention or issue_comment (REQ-watch-007). Injectable client for fixtures.
 */

import { Octokit } from "@octokit/rest";
import { attribution } from "../attribution.ts";
import type { DetectedEvent } from "./types.ts";

export const ACK_START =
  "Ack — Corvidinho WATCH saw this and started a session.";
export const ACK_CONTINUE =
  "Ack — Corvidinho WATCH saw this and continued a session.";

/** Event types that trigger auto-ack (mention / comment only). */
export function isAckableEventType(type: DetectedEvent["type"]): boolean {
  return type === "issue_comment" || type === "issues";
}

/**
 * Whether this event should receive an ack comment.
 * Skip own watch-username sender (no self-loop) and non-mention/comment types.
 */
export function shouldAckEvent(
  event: DetectedEvent,
  mentionUsername: string,
): boolean {
  if (!isAckableEventType(event.type)) return false;
  if (!mentionUsername) return false;
  if (event.sender.toLowerCase() === mentionUsername.toLowerCase()) {
    return false;
  }
  return true;
}

export function buildAckBody(kind: "start_session" | "continue_session"): string {
  const line = kind === "continue_session" ? ACK_CONTINUE : ACK_START;
  const foot = attribution("markdown");
  return `${line}\n\n---\n${foot}`;
}

export type AckCommentResult = {
  ok: boolean;
  dryRun?: boolean;
  id?: number;
  url?: string;
  error?: string;
};

export type AckClient = {
  createIssueComment(opts: {
    owner: string;
    repo: string;
    issue_number: number;
    body: string;
  }): Promise<AckCommentResult>;
};

/** In-memory echo / dry-run ack client (tests + WATCH dry-run). */
export function createEchoAckClient(): AckClient & {
  posts: Array<{
    owner: string;
    repo: string;
    issue_number: number;
    body: string;
  }>;
} {
  const posts: Array<{
    owner: string;
    repo: string;
    issue_number: number;
    body: string;
  }> = [];
  return {
    posts,
    async createIssueComment(opts) {
      posts.push({ ...opts });
      return {
        ok: true,
        dryRun: true,
        id: posts.length,
        url: `https://example.com/${opts.owner}/${opts.repo}/issues/${opts.issue_number}#ack-${posts.length}`,
      };
    },
  };
}

export function createOctokitAckClient(token: string): AckClient {
  const octokit = new Octokit({ auth: token, userAgent: "corvidinho-watch-ack" });
  return {
    async createIssueComment(opts) {
      try {
        const res = await octokit.rest.issues.createComment({
          owner: opts.owner,
          repo: opts.repo,
          issue_number: opts.issue_number,
          body: opts.body,
        });
        return {
          ok: true,
          id: res.data.id,
          url: res.data.html_url,
        };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    },
  };
}

/** Dedup store for event ids that already received an ack. */
export class AckedIdStore {
  private ids = new Set<string>();
  private readonly maxSize: number;

  constructor(maxSize = 2000) {
    this.maxSize = maxSize;
  }

  has(id: string): boolean {
    return this.ids.has(id.toLowerCase());
  }

  add(id: string): void {
    this.ids.add(id.toLowerCase());
    if (this.ids.size > this.maxSize) {
      const first = this.ids.values().next().value;
      if (first !== undefined) this.ids.delete(first);
    }
  }
}

function splitRepo(repo: string): { owner: string; name: string } | null {
  const parts = repo.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], name: parts[1] };
}

export type AckAttemptResult = {
  /** Whether an ack was attempted (eligible + not duplicate). */
  attempted: boolean;
  /** Whether the ack comment was posted successfully (incl. dry-run ok). */
  posted: boolean;
};

/**
 * Post ack for a start/continue action when eligible and not yet acked.
 * `posted` is true only on a successful createIssueComment (WATCH-RELIABILITY-1 gate).
 */
export async function maybePostWatchAck(opts: {
  event: DetectedEvent;
  kind: "start_session" | "continue_session";
  mentionUsername: string;
  ackClient: AckClient;
  acked: AckedIdStore;
  log?: (msg: string) => void;
}): Promise<AckAttemptResult> {
  const { event, kind, mentionUsername, ackClient, acked, log } = opts;
  if (!shouldAckEvent(event, mentionUsername)) {
    return { attempted: false, posted: false };
  }
  if (acked.has(event.id)) {
    log?.(`[watch] ack skip duplicate id=${event.id}`);
    return { attempted: false, posted: false };
  }
  const parts = splitRepo(event.repo);
  if (!parts) {
    log?.(`[watch] ack skip bad repo=${event.repo}`);
    return { attempted: false, posted: false };
  }
  const body = buildAckBody(kind);
  const res = await ackClient.createIssueComment({
    owner: parts.owner,
    repo: parts.name,
    issue_number: event.number,
    body,
  });
  // Mark acked even on failure to avoid tight retry spam; operator sees log.
  acked.add(event.id);
  if (res.ok) {
    log?.(
      `[watch] ack ${res.dryRun ? "dry-run" : "posted"} ${event.repo}#${event.number} id=${event.id}` +
        (res.url ? ` url=${res.url}` : ""),
    );
    return { attempted: true, posted: true };
  }
  log?.(`[watch] ack failed ${event.repo}#${event.number} id=${event.id}: ${res.error ?? "unknown"}`);
  return { attempted: true, posted: false };
}

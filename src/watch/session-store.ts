/**
 * In-memory WATCH session stubs keyed by owner/repo#number.
 * No ProcessManager; no durable DB for thin slice.
 */

import type { SessionStub } from "./types.ts";

function newId(): string {
  return `wsess_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function issueKey(repo: string, number: number): string {
  return `${repo.toLowerCase()}#${number}`;
}

export class SessionStore {
  readonly byIssueKey = new Map<string, SessionStub>();
  readonly bySessionId = new Map<string, SessionStub>();

  create(opts: {
    repo: string;
    number: number;
    userId: string;
    topic?: string;
    id?: string;
  }): SessionStub {
    const now = Date.now();
    const session: SessionStub = {
      id: opts.id ?? newId(),
      repo: opts.repo,
      number: opts.number,
      userId: opts.userId,
      topic: opts.topic,
      createdAt: now,
      lastActivityAt: now,
    };
    this.bySessionId.set(session.id, session);
    this.byIssueKey.set(issueKey(session.repo, session.number), session);
    return session;
  }

  touch(session: SessionStub): void {
    session.lastActivityAt = Date.now();
  }

  getByIssue(repo: string, number: number): SessionStub | undefined {
    return this.byIssueKey.get(issueKey(repo, number));
  }

  get(sessionId: string): SessionStub | undefined {
    return this.bySessionId.get(sessionId);
  }

  list(): SessionStub[] {
    return [...this.bySessionId.values()].sort(
      (a, b) => b.lastActivityAt - a.lastActivityAt,
    );
  }
}

/**
 * Event → session stub after allowlist gates (ALLOW-1/2/5).
 * Allowlist BEFORE any session spawn.
 */

import {
  isGithubUserAllowed,
  isRepoAllowed,
} from "../allowlist/github.ts";
import type { AllowlistConfig } from "../allowlist/types.ts";
import type { SessionStore } from "./session-store.ts";
import {
  NOT_AUTHORIZED,
  type DetectedEvent,
  type RouteAction,
} from "./types.ts";

export type RouterDeps = {
  store: SessionStore;
  allowlist: AllowlistConfig;
};

function buildPrompt(event: DetectedEvent): string {
  const kind = event.type;
  const header = `[WATCH ${kind}] ${event.repo}#${event.number} by @${event.sender}`;
  const title = event.title ? `\nTitle: ${event.title}` : "";
  const url = event.htmlUrl ? `\nURL: ${event.htmlUrl}` : "";
  const body = event.body?.trim() ? `\n\n${event.body.trim()}` : "";
  return `${header}${title}${url}${body}`.slice(0, 8000);
}

/**
 * Pure router: allowlist repo + user, then start/continue/refuse/ignore.
 */
export function routeEvent(
  event: DetectedEvent,
  deps: RouterDeps,
): RouteAction {
  const repoGate = isRepoAllowed(event.repo, deps.allowlist.github);
  if (!repoGate.ok) {
    return {
      kind: "refuse",
      reason: "repo_not_allowlisted",
      reply: NOT_AUTHORIZED,
      event,
    };
  }

  const userGate = isGithubUserAllowed(event.sender, deps.allowlist.github);
  if (!userGate.ok) {
    return {
      kind: "refuse",
      reason: "user_not_allowlisted",
      reply: NOT_AUTHORIZED,
      event,
    };
  }

  const existing = deps.store.getByIssue(event.repo, event.number);
  if (existing) {
    deps.store.touch(existing);
    return {
      kind: "continue_session",
      session: existing,
      prompt: buildPrompt(event),
      event,
    };
  }

  const session = deps.store.create({
    repo: event.repo,
    number: event.number,
    userId: event.sender,
    topic: event.title,
  });
  return {
    kind: "start_session",
    session,
    prompt: buildPrompt(event),
    event,
  };
}

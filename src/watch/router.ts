/**
 * Event → session stub after allowlist gates (ALLOW-1/2/5).
 * Allowlist BEFORE any session spawn. Assignment and review-request events
 * also gate the user who assigned / requested (REQ-watch-302).
 */

import {
  isGithubUserAllowed,
  isRepoAllowed,
} from "../allowlist/github.ts";
import type { AllowlistConfig, GithubAllowlists } from "../allowlist/types.ts";
import type { SessionStore } from "./session-store.ts";
import {
  NOT_AUTHORIZED,
  type DetectedEvent,
  type DetectedEventType,
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
 * Event types started by someone acting on the thread (assigning the watch
 * user, requesting its review), who need not be the thread author.
 */
const ACTOR_GATED_TYPES: ReadonlySet<DetectedEventType> = new Set([
  "assignment",
  "review_request",
]);

export type EventGateResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "repo_not_allowlisted"
        | "user_not_allowlisted"
        | "actor_not_allowlisted";
    };

/**
 * Repo + user allowlist gates for one event (ALLOW-1/2; deny lists win).
 * Assignment / review_request events also need the user who assigned or
 * requested (`actor`) to pass the user gate; no actor → refused (fail closed).
 */
export function gateEvent(
  event: DetectedEvent,
  github: GithubAllowlists,
): EventGateResult {
  if (!isRepoAllowed(event.repo, github).ok) {
    return { ok: false, reason: "repo_not_allowlisted" };
  }
  if (!isGithubUserAllowed(event.sender, github).ok) {
    return { ok: false, reason: "user_not_allowlisted" };
  }
  if (
    ACTOR_GATED_TYPES.has(event.type) &&
    !isGithubUserAllowed(event.actor ?? "", github).ok
  ) {
    return { ok: false, reason: "actor_not_allowlisted" };
  }
  return { ok: true };
}

/**
 * Pure router: allowlist repo + user (+ actor), then start/continue/refuse/ignore.
 */
export function routeEvent(
  event: DetectedEvent,
  deps: RouterDeps,
): RouteAction {
  const gate = gateEvent(event, deps.allowlist.github);
  if (!gate.ok) {
    return {
      kind: "refuse",
      reason: gate.reason,
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

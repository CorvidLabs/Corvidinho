/**
 * Event → session stub after allowlist gates (ALLOW-1/2/5).
 * Allowlist BEFORE any session spawn. Assignment and review-request events
 * also gate the user who assigned / requested (REQ-watch-302).
 *
 * IDENTITY-14 / IDENTITY-7: with the owner's declared people, the commenter
 * is recognised by their GitHub numeric id / login (never a display name)
 * and the prompt opens with a `[Corvidinho acting GitHub user …]` block
 * naming the declared person (Planning ignores that paragraph, as it does the
 * Discord identity block).
 */

import {
  isGithubUserAllowed,
  isRepoAllowed,
} from "../allowlist/github.ts";
import type { AllowlistConfig, GithubAllowlists } from "../allowlist/types.ts";
import {
  OWNER_PERSON_ID,
  resolvePerson,
  type PeopleDirectory,
} from "../identity/people.ts";
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
  /**
   * Declared people (IDENTITY-13/14), re-read per event by the poller.
   * Omitted ⇒ no identity block (as before #36).
   */
  people?: PeopleDirectory | null;
};

export const WATCH_IDENTITY_HEADER =
  "[Corvidinho acting GitHub user — recognised from the owner's people list by GitHub account (numeric id / login), never by a name]";

/**
 * Identity block for the commenter, or null when nobody is declared and the
 * commenter is not the owner. An undeclared commenter is marked as such once
 * anyone is declared, so a GitHub name never passes for a declared person.
 */
export function formatWatchIdentityBlock(
  event: Pick<DetectedEvent, "sender" | "senderId">,
  people: PeopleDirectory | null | undefined,
): string | null {
  if (!people) return null;
  const person = resolvePerson(people, {
    githubLogin: event.sender,
    githubId: event.senderId,
  });
  if (!person) {
    if (!people.people.some((p) => p.id !== OWNER_PERSON_ID)) return null;
    return [
      WATCH_IDENTITY_HEADER,
      `- github_login: ${event.sender}`,
      "- declared_person: none (not on the owner's people list; a name never makes someone a declared person)",
    ].join("\n");
  }
  const lines = [
    WATCH_IDENTITY_HEADER,
    `- github_login: ${event.sender}`,
    `- declared_person: ${person.personId}`,
  ];
  if (person.displayName) lines.push(`- display_name: ${person.displayName}`);
  if (person.person.nicknames.length > 0) {
    lines.push(`- nicknames: ${person.person.nicknames.join(", ")}`);
  }
  if (person.role === "owner") {
    lines.push("- role: owner (recognised here; a GitHub run still gets no ADMIN tools)");
  }
  lines.push("- Address this user by display_name when present; do not invent alternate names.");
  return lines.join("\n");
}

function buildPrompt(event: DetectedEvent, people?: PeopleDirectory | null): string {
  const kind = event.type;
  const header = `[WATCH ${kind}] ${event.repo}#${event.number} by @${event.sender}`;
  const title = event.title ? `\nTitle: ${event.title}` : "";
  const url = event.htmlUrl ? `\nURL: ${event.htmlUrl}` : "";
  const body = event.body?.trim() ? `\n\n${event.body.trim()}` : "";
  const identity = formatWatchIdentityBlock(event, people);
  const lead = identity ? `${identity}\n\n` : "";
  return `${lead}${header}${title}${url}${body}`.slice(0, 8000);
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
      prompt: buildPrompt(event, deps.people),
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
    prompt: buildPrompt(event, deps.people),
    event,
  };
}

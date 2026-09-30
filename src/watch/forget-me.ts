/**
 * MEMORY-ACL-6.a — someone known only on GitHub can ask there to be
 * forgotten (#101); it forgets only after the owner approves on the card.
 *
 * - A clear "forget me" to the watch user — a comment or issue body that
 *   @mentions it and says only that (quoted lines ignored; see
 *   {@link isWatchForgetMeRequest}) — is handled by the poller itself, with
 *   no model call and no run, after the usual repo + user allowlist gates.
 * - The sender is matched in the owner's people list by their GitHub numeric
 *   id only (IDENTITY-7; a login alone never counts, so a renamed or
 *   re-registered login cannot ask for someone else). A declared person's
 *   ask is recorded as the same `forget_requests` row a Discord ask is
 *   (SAFE-5 `memory-forget-request` `started` first, fail closed; one open
 *   ask per person), so the bridge DMs the owner the same Approve/Deny card
 *   (src/discord/forget-card.ts). Nothing is deleted here.
 * - One reply on the thread says the request went to the owner (or is
 *   already waiting); an undeclared sender is told nothing is kept for them
 *   and no card is raised; a login on the list without its account id is
 *   told it cannot be confirmed (the owner can start it with /admin).
 * - Once the owner decides (or the ask lapses), the poller posts the outcome
 *   on that thread while its repo is still allowlisted, giving up after a
 *   day ({@link deliverWatchForgetOutcomes}); never a count or any content.
 */

import type { Database } from "bun:sqlite";
import { isRepoAllowed } from "../allowlist/github.ts";
import type { GithubAllowlists } from "../allowlist/types.ts";
import { appendAudit, argsDigest, auditKeyFromEnv } from "../audit/index.ts";
import { attribution } from "../attribution.ts";
import {
  normalizeGithubId,
  OWNER_PERSON_ID,
  resolvePerson,
  validGithubLogin,
  type PeopleDirectory,
} from "../identity/people.ts";
import {
  encodeForgetRequester,
  encodeGithubOrigin,
  FORGET_REQUEST_TTL_MS,
  ForgetRequestStore,
  githubOriginOf,
  type ForgetRequest,
} from "../memory/forget.ts";
import { memorySubjectFor, memorySubjectForPerson, type MemorySubject } from "../memory/scope.ts";
import type { AckClient, AckCommentResult } from "./ack.ts";
import { parseGithubRateLimit } from "./rate-limit.ts";
import { containsMention } from "./searcher.ts";
import type { DetectedEvent, DetectedEventType } from "./types.ts";

/** SAFE-5 surface of a GitHub forget ask's rows. */
export const WATCH_FORGET_AUDIT_SURFACE = "watch:forget-me";

/** Event types whose text is the sender's own words to the watch user. */
const FORGET_ME_TYPES: ReadonlySet<DetectedEventType> = new Set<DetectedEventType>([
  "issue_comment",
  "issues",
  "pull_request_review_comment",
]);

/**
 * What is left of a "forget me" comment once the @mention, punctuation and
 * case are gone: a short ask to forget the sender and nothing else.
 */
const FORGET_ME_RE = new RegExp(
  "^(?:(?:hi|hey|hello)\\s+)?(?:please\\s+)?" +
    "(?:(?:can|could|would|will)\\s+you\\s+(?:please\\s+)?|i\\s+(?:want|would\\s+like)\\s+you\\s+to\\s+)?" +
    "(?:forget\\s+(?:about\\s+)?me" +
    "|(?:forget|delete|erase|remove)\\s+(?:everything|all|what)\\s+" +
    "(?:(?:that\\s+)?you\\s+(?:know|remember|have|keep|store|stored)(?:\\s+(?:stored|kept))?\\s+)?" +
    "(?:about|of|on)\\s+me)" +
    "(?:\\s+please)?(?:\\s+thanks?(?:\\s+you)?)?$",
);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A clear ask to be forgotten, addressed to the watch user (MEMORY-ACL-6.a):
 * a comment (or issue body) from someone other than the watch user that
 * @mentions it outside quoted lines and, with the mention and punctuation
 * dropped, says only "forget me" or "forget / delete everything (you know)
 * about me" (optionally with please / can you / thanks). Anything more goes
 * to a normal run. Never a model call.
 */
export function isWatchForgetMeRequest(
  event: Pick<DetectedEvent, "type" | "body" | "sender">,
  mentionUsername: string,
): boolean {
  if (!FORGET_ME_TYPES.has(event.type)) return false;
  const watchUser = mentionUsername.trim();
  if (!watchUser || event.sender.trim().toLowerCase() === watchUser.toLowerCase()) return false;
  // Quoted lines are someone else's words.
  const own = (event.body ?? "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*>/.test(line))
    .join(" ");
  if (!containsMention(own, watchUser)) return false;
  const text = own
    .replace(new RegExp(`(^|[^\\w])@${escapeRe(watchUser)}\\b`, "gi"), "$1 ")
    .replace(/[,.!?;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return FORGET_ME_RE.test(text);
}

export type WatchForgetMeOutcome =
  /** Recorded (or already pending): the owner's card is raised by the bridge. */
  | { kind: "requested"; request: ForgetRequest; created: boolean }
  /** Not on the owner's people list: nothing kept for them, no card. */
  | { kind: "not_declared" }
  /** Their login is on the list but their numeric id is not (IDENTITY-7): no card. */
  | { kind: "unconfirmed" }
  /** No owner configured: nobody could approve (IDENTITY-3). */
  | { kind: "no_owner" }
  /** Could not record it (no DB, audit trail unavailable, store failure). */
  | { kind: "error"; message: string };

/**
 * The subject a GitHub sender's numeric id resolves to (IDENTITY-7): their
 * declared person, or — for the owner's built-in entry — the owner's
 * Discord-id scope, as `memorySubjectForGithub` reads it; else null.
 */
export function forgetSubjectForGithubId(
  people: PeopleDirectory | null | undefined,
  githubId: string | number | undefined,
): MemorySubject | null {
  const id = normalizeGithubId(githubId);
  if (!people || !id) return null;
  const resolved = resolvePerson(people, { githubId: id });
  if (!resolved) return null;
  if (resolved.personId === OWNER_PERSON_ID) {
    const ownerDiscord = people.owner?.discordId;
    return ownerDiscord ? memorySubjectFor(people, ownerDiscord) : null;
  }
  return memorySubjectForPerson(people, resolved.personId);
}

/**
 * Record a GitHub "forget me" (MEMORY-ACL-6.a) — nothing is deleted here.
 * Never throws.
 */
export function recordWatchForgetMe(opts: {
  event: Pick<DetectedEvent, "sender" | "senderId" | "repo" | "number">;
  people: PeopleDirectory | null | undefined;
  db: Database | undefined;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
}): WatchForgetMeOutcome {
  const { event, people } = opts;
  const githubId = normalizeGithubId(event.senderId);
  const login = validGithubLogin(event.sender);
  const subject = login ? forgetSubjectForGithubId(people, githubId) : null;
  if (!subject || !login || !githubId) {
    const byLogin = login ? people?.byGithubLogin.get(login) : undefined;
    return byLogin ? { kind: "unconfirmed" } : { kind: "not_declared" };
  }
  if (!people?.owner) return { kind: "no_owner" };
  if (!opts.db) return { kind: "error", message: "no database" };
  const db = opts.db;
  const env = opts.env ?? process.env;
  const now = opts.now ?? Date.now;
  const audit = (outcome: "started" | "ok" | "error") =>
    appendAudit(
      db,
      {
        action: "memory-forget-request",
        actor: `github:${login}`,
        surface: WATCH_FORGET_AUDIT_SURFACE,
        argsDigest: argsDigest(["forget-me", subject.kind, subject.id]),
        outcome,
      },
      { key: auditKeyFromEnv(env), now: now() },
    );
  // SAFE-5: the intent is on the trail first; no row ⇒ nothing recorded.
  try {
    audit("started");
  } catch (err) {
    return { kind: "error", message: `audit log unavailable (SAFE-5): ${err instanceof Error ? err.message : String(err)}` };
  }
  let made: { request: ForgetRequest; created: boolean };
  try {
    made = new ForgetRequestStore({ db, now }).request({
      subject,
      requesterUserId: encodeForgetRequester({ via: "github", githubId, login }),
      originChannelId: encodeGithubOrigin({ repo: event.repo, number: event.number }),
    });
  } catch (err) {
    try {
      audit("error");
    } catch {
      /* the refusal stands */
    }
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }
  try {
    audit("ok");
  } catch {
    /* the started row is written; the request stands */
  }
  return { kind: "requested", request: made.request, created: made.created };
}

function footer(text: string): string {
  return `${text}\n\n---\n${attribution("markdown")}`;
}

/** The one reply on the thread for a GitHub "forget me" (MEMORY-ACL-6.a). */
export function watchForgetMeReplyBody(login: string, outcome: WatchForgetMeOutcome): string {
  const who = `@${login}`;
  const hours = Math.round(FORGET_REQUEST_TTL_MS / 3_600_000);
  switch (outcome.kind) {
    case "requested":
      return footer(
        outcome.created
          ? `${who} I've asked the owner to approve forgetting what I remember about you (request ${outcome.request.id}). Nothing is forgotten unless they approve it on their card; no answer within ${hours} h means no. I'll post the outcome here. (MEMORY-ACL-6.a)`
          : `${who} Your forget request (${outcome.request.id}) is already waiting for the owner; nothing is forgotten unless they approve it on their card. (MEMORY-ACL-6.a)`,
      );
    case "not_declared":
      return footer(
        `${who} You're not on the owner's people list, so I keep no memory or profile for this GitHub account: there is nothing of yours for me to forget, and no request was made. (What was said on an issue or PR is kept as context for 30 days after its last activity, then deleted.)`,
      );
    case "unconfirmed":
      return footer(
        `${who} I can't confirm this GitHub account is the person on the owner's people list (people are matched by GitHub account id, never by login alone), so no forget request was made. The owner can start one for you.`,
      );
    case "no_owner":
      return footer(`${who} No owner is configured to approve a forget request, so nothing was recorded.`);
    case "error":
      return footer(`${who} I couldn't record your forget request right now, so nothing was recorded. Please ask again later.`);
  }
}

function splitRepo(repo: string): { owner: string; name: string } | null {
  const parts = repo.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], name: parts[1] };
}

/**
 * Handle a GitHub "forget me" event: record it (or not) and post the one
 * reply on its thread. Never throws; the event is already marked processed.
 */
export async function handleWatchForgetMe(opts: {
  event: DetectedEvent;
  people: PeopleDirectory | null | undefined;
  db: Database | undefined;
  ackClient: AckClient;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  log?: (msg: string) => void;
  onPostFailed?: (res: AckCommentResult) => void;
}): Promise<WatchForgetMeOutcome> {
  const { event, log } = opts;
  const outcome = recordWatchForgetMe(opts);
  const detail =
    outcome.kind === "requested"
      ? `${outcome.request.id}${outcome.created ? "" : " (already pending)"}`
      : outcome.kind === "error"
        ? `error: ${outcome.message}`
        : outcome.kind;
  log?.(`[watch] forget-me ${event.repo}#${event.number} id=${event.id} @${event.sender}: ${detail}`);
  const parts = splitRepo(event.repo);
  if (!parts) return outcome;
  try {
    const res = await opts.ackClient.createIssueComment({
      owner: parts.owner,
      repo: parts.name,
      issue_number: event.number,
      body: watchForgetMeReplyBody(validGithubLogin(event.sender) ?? event.sender, outcome),
    });
    if (!res.ok) {
      log?.(`[watch] forget-me reply failed ${event.repo}#${event.number}: ${res.error ?? "unknown"}`);
      opts.onPostFailed?.(res);
    }
  } catch (err) {
    log?.(`[watch] forget-me reply failed ${event.repo}#${event.number}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return outcome;
}

/** The outcome posted on a GitHub asker's thread: never a count or content. */
export function watchForgetOutcomeBody(req: ForgetRequest): string {
  const who = req.requester.via === "github" ? `@${req.requester.login} ` : "";
  if (req.status === "approved") {
    return footer(`${who}Your forget request (${req.id}) was approved: I deleted what I remembered about you and the conversations with you that I kept.`);
  }
  if (req.status === "denied") {
    return footer(`${who}The owner did not approve your forget request (${req.id}), so nothing was forgotten.`);
  }
  return footer(`${who}Your forget request (${req.id}) got no answer in time, so nothing was forgotten. You can ask again.`);
}

/**
 * Post the outcome of each decided GitHub ask on its thread (MEMORY-ACL-6.a)
 * while its repo is still allowlisted, and mark it told; an ask that cannot
 * be told is given up a day after it was decided. Stops at the first post
 * that hits a rate limit or gets no answer (the next ones would fail the same
 * way); any other failed post (a locked or deleted thread) is that thread's
 * alone, so the next asks still go out. Returns how many were posted. Never
 * throws.
 */
export async function deliverWatchForgetOutcomes(opts: {
  db: Database;
  github: GithubAllowlists;
  ackClient: AckClient;
  now?: () => number;
  log?: (msg: string) => void;
  onPostFailed?: (res: AckCommentResult) => void;
}): Promise<number> {
  const now = opts.now ?? Date.now;
  const store = new ForgetRequestStore({ db: opts.db, now });
  let posted = 0;
  let pending: ForgetRequest[];
  try {
    pending = store.unnotifiedGithub();
  } catch (err) {
    opts.log?.(`[watch] forget outcomes read failed: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
  for (const req of pending) {
    const giveUp = (req.decidedAt ?? req.createdAt) + FORGET_REQUEST_TTL_MS <= now();
    const thread = githubOriginOf(req);
    const parts = thread ? splitRepo(thread.repo) : null;
    if (!thread || !parts || !isRepoAllowed(thread.repo, opts.github).ok) {
      if (giveUp || !parts) {
        store.markNotified(req.id);
        opts.log?.(`[watch] forget request ${req.id}: thread not reachable; the outcome was not posted`);
      }
      continue;
    }
    let res: AckCommentResult;
    try {
      res = await opts.ackClient.createIssueComment({
        owner: parts.owner,
        repo: parts.name,
        issue_number: thread.number,
        body: watchForgetOutcomeBody(req),
      });
    } catch (err) {
      res = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    if (res.ok) {
      store.markNotified(req.id);
      posted += 1;
      opts.log?.(`[watch] forget outcome ${req.status} posted ${thread.repo}#${thread.number} (${req.id})`);
      continue;
    }
    opts.log?.(`[watch] forget outcome post failed ${thread.repo}#${thread.number} (${req.id}): ${res.error ?? "unknown"}`);
    opts.onPostFailed?.(res);
    if (giveUp) store.markNotified(req.id);
    // A rate limit (or no HTTP answer at all) stops the pass; a locked or
    // deleted thread must not hold up everyone else's outcome for a day.
    const rateLimited =
      res.status === undefined ||
      parseGithubRateLimit({ status: res.status, message: res.error, headers: res.headers }, now()) !== null;
    if (rateLimited) break;
  }
  return posted;
}

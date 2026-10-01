/**
 * WATCH-RELIABILITY-1 — short summary comment after agent run finishes,
 * once per event id, only after a successful auto-ack.
 *
 * REQ-watch-231 / SAFE-6 — the summary is agent output (or its stderr) and
 * the comment is public on public repos, so it is secret-scrubbed first.
 * REQ-watch-734 / ROLES-CHAT-3 — the 1200-char clip keeps a closing
 * "(not allowed for your role)" note.
 * REQ-watch-009 / DISCORD-3.b on GitHub — a failed run without an ask of its
 * own shows one plain reason line (`watchFailureReason`: which model call
 * failed and how, the no-provider notice, which verify failed), never the
 * run's summary, so a provider's reply body (account or org names, request
 * ids, quota details) never lands on a public thread; the comment names the
 * model call's status but not the provider's host (`watchPublicFailureLine`),
 * which only the `[watch] run failed` log line keeps.
 * AGENT-12 — a run that hit the turn cap I set says so in a plain line after
 * the run's summary; a failed run's comment shows its one reason line
 * instead, without the note (an idle-timed-out run's reason line is
 * `Stopped: no output for … (idle timeout).`).
 */

import { TURN_CAP_NOTE } from "../agent/limits.ts";
import { withoutProviderHost } from "../agent/providers.ts";
import { clipKeepingRoleNote } from "../agent/task-summary.ts";
import { describeInjectionReasons } from "../agent/untrusted.ts";
import { attribution } from "../attribution.ts";
import { failureReasonFor } from "../discord/failure-reason.ts";
import { scrubSecrets } from "../store/scrub.ts";
import type { AckClient, AckCommentResult } from "./ack.ts";
import { isAckableEventType } from "./ack.ts";
import { ProcessedIdStore, type IdStoreOptions } from "./dedup.ts";
import type { AgentSpawnResult, DetectedEvent } from "./types.ts";

/**
 * Dedup store for event ids that already received a run-summary comment.
 * With a db the ids persist across restarts (REQ-watch-247).
 */
export class SummarizedIdStore extends ProcessedIdStore {
  constructor(opts: number | IdStoreOptions = {}) {
    super(opts, "summarized");
  }
}

/** Event ids that received a *successful* auto-ack (eligible for summary). */
export class SuccessfulAckStore {
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

/**
 * SAFE-13 — the summary line for a run whose tool result looked like a
 * prompt-injection attempt, @mentioning the owner's GitHub login when set.
 */
export function watchInjectionLine(
  injection: NonNullable<AgentSpawnResult["injection"]>,
  ownerLogin?: string,
): string {
  const who = ownerLogin ? `@${ownerLogin} ` : "";
  return (
    `${who}heads-up: a ${injection.source} result in this run looked like a prompt-injection attempt ` +
    `(it ${describeInjectionReasons(injection.reasons)}); I didn't act on it. (SAFE-13)`
  );
}

/**
 * SAFE-13 — the comment for a run whose tool result looked like a
 * prompt-injection attempt when no summary comment carries it (an event type
 * WATCH does not ack, such as an assignment or review request, or an ack that
 * did not go out): the owner line and the attribution footer.
 */
export function buildInjectionNoticeBody(
  injection: NonNullable<AgentSpawnResult["injection"]>,
  ownerLogin?: string,
): string {
  return `Corvidinho WATCH — ${watchInjectionLine(injection, ownerLogin)}\n\n---\n${attribution("markdown")}`;
}

/**
 * SAFE-13 — post {@link buildInjectionNoticeBody} for a run whose summary
 * comment was not posted, so the owner is told rather than the hit living
 * only in the audit row. Once per event (the summary dedup store, so a
 * restart never posts twice); skipped for a bad repo. True when a post was
 * attempted.
 */
export async function maybePostWatchInjectionNotice(opts: {
  event: DetectedEvent;
  injection: NonNullable<AgentSpawnResult["injection"]>;
  ownerLogin?: string;
  ackClient: AckClient;
  summarized: SummarizedIdStore;
  log?: (msg: string) => void;
  onPostFailed?: (res: AckCommentResult) => void;
}): Promise<boolean> {
  const { event, ackClient, summarized, log } = opts;
  if (summarized.has(event.id)) return false;
  const parts = splitRepo(event.repo);
  if (!parts) {
    log?.(`[watch] injection notice skip bad repo=${event.repo}`);
    return false;
  }
  const res = await ackClient.createIssueComment({
    owner: parts.owner,
    repo: parts.name,
    issue_number: event.number,
    body: buildInjectionNoticeBody(opts.injection, opts.ownerLogin),
  });
  try {
    summarized.add(event.id);
  } catch (err) {
    log?.(
      `[watch] injection notice id write failed id=${event.id}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (res.ok) {
    log?.(
      `[watch] injection notice ${res.dryRun ? "dry-run" : "posted"} ${event.repo}#${event.number} id=${event.id}`,
    );
  } else {
    log?.(
      `[watch] injection notice failed ${event.repo}#${event.number} id=${event.id}: ${res.error ?? "unknown"}`,
    );
    opts.onPostFailed?.(res);
  }
  return true;
}

/**
 * REQ-watch-009 / DISCORD-3.b on GitHub: why a WATCH run failed, as one
 * plain line — what the `[watch] run failed` log line says, and (without the
 * provider's host, `watchPublicFailureLine`) what its summary comment shows in
 * place of the run's summary. The same reason the Discord surfaces give
 * (`failureReasonFor`): the result frame's `error` (which model call failed
 * and how — status and host, never the provider's reply body; the
 * no-provider notice; which verify failed),
 * else the no-provider notice for the run's tier in `env`, else the last
 * meaningful line of the run's stderr, else the exit code; SAFE-6 scrubbed,
 * host paths and stack frames dropped, at most 200 characters. Null for a
 * run that did not fail and for a failed run that stopped on an ask of its
 * own (its summary carries `Needs your input: …`, REQ-watch-086).
 */
export function watchFailureReason(
  spawn: Pick<AgentSpawnResult, "ok" | "exitCode" | "ask" | "failureReason" | "stderrTail">,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (spawn.ok || spawn.ask) return null;
  return failureReasonFor(
    {
      exitCode: spawn.exitCode,
      ...(spawn.failureReason ? { failureReason: spawn.failureReason } : {}),
      ...(spawn.stderrTail ? { stderrTail: spawn.stderrTail } : {}),
    },
    env,
  );
}

/**
 * REQ-watch-009: a failed run's reason as the public thread and the thread's
 * kept agent turn show it — a model-call line without the provider's host
 * (`The model call failed (429 Too Many Requests)`), since a host can be the
 * account's own resource name (`<resource>.openai.azure.com`), a private
 * gateway or an Ollama server's address, and a kept turn is replayed to the
 * model, which could repeat it in a later public comment. The owner's
 * `[watch] run failed` log line keeps the host. Any other reason (the no-key
 * line, the no-provider notice, a stderr line, the exit-code line) is
 * returned as is. The shared `withoutProviderHost` (src/agent/providers.ts),
 * which a failed delegate worker's line for its lead uses too.
 */
export function watchPublicFailureLine(reason: string): string {
  return withoutProviderHost(reason);
}

/**
 * The run-summary comment: the status line, then the run's summary (SAFE-6
 * scrubbed, clipped to 1200) — or, for a failed run without an ask of its
 * own, its one plain reason line without the provider's host
 * (`watchFailureReason` read with `env`, then `watchPublicFailureLine`) —
 * then the AGENT-12 `TURN_CAP_NOTE` when it shows a turn-capped run's
 * summary, then the SAFE-13 owner line when the run reports one, then the
 * footer.
 */
export function buildSummaryBody(
  spawn: AgentSpawnResult,
  ownerLogin?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const status = spawn.ok
    ? `Done (exit ${spawn.exitCode}).`
    : `Failed (exit ${spawn.exitCode}).`;
  // Scrub before clipping so a token cut at the cap leaks no prefix. The clip
  // keeps a closing "(not allowed for your role)" note (ROLES-CHAT-3,
  // REQ-watch-734).
  const reason = watchFailureReason(spawn, env);
  const preview =
    reason !== null
      ? watchPublicFailureLine(reason)
      : clipKeepingRoleNote(
          scrubSecrets(spawn.summary || "").trim(),
          1200,
          (head, max) => head.slice(0, max),
        );
  const body = preview
    ? `Corvidinho WATCH run summary — ${status}\n\n${preview}`
    : `Corvidinho WATCH run summary — ${status}`;
  // AGENT-12: the turn-cap note follows the run's best answer; a failed run's
  // comment shows its one reason line instead (REQ-watch-009), without it.
  const capped =
    reason === null && spawn.stopReason === "turn-cap" ? `\n\n${TURN_CAP_NOTE}` : "";
  const notice = spawn.injection ? `\n\n${watchInjectionLine(spawn.injection, ownerLogin)}` : "";
  const foot = attribution("markdown");
  return `${body}${capped}${notice}\n\n---\n${foot}`;
}

function splitRepo(repo: string): { owner: string; name: string } | null {
  const parts = repo.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], name: parts[1] };
}

/**
 * Post a short summary after the agent run when:
 * - event is mention/comment (ackable),
 * - a successful auto-ack was recorded for this event id,
 * - summary not yet posted for this event id.
 */
export async function maybePostWatchSummary(opts: {
  event: DetectedEvent;
  spawn: AgentSpawnResult;
  ackClient: AckClient;
  successfulAcks: SuccessfulAckStore;
  summarized: SummarizedIdStore;
  /** SAFE-13: the owner's GitHub login, @mentioned when the run reports an injection. */
  ownerLogin?: string;
  /** The watcher's env, for a failed run's no-provider reason (default process.env). */
  env?: NodeJS.ProcessEnv;
  log?: (msg: string) => void;
  /**
   * Called with the failed post result after the `summary failed` line; the
   * poller uses it for rate-limit backoff (WATCH-RELIABILITY-3).
   */
  onPostFailed?: (res: AckCommentResult) => void;
}): Promise<boolean> {
  const { event, spawn, ackClient, successfulAcks, summarized, log, onPostFailed } =
    opts;

  if (!isAckableEventType(event.type)) return false;
  if (!successfulAcks.has(event.id)) {
    log?.(`[watch] summary skip no-successful-ack id=${event.id}`);
    return false;
  }
  if (summarized.has(event.id)) {
    log?.(`[watch] summary skip duplicate id=${event.id}`);
    return false;
  }

  const parts = splitRepo(event.repo);
  if (!parts) {
    log?.(`[watch] summary skip bad repo=${event.repo}`);
    return false;
  }

  const body = buildSummaryBody(spawn, opts.ownerLogin, opts.env);
  const res = await ackClient.createIssueComment({
    owner: parts.owner,
    repo: parts.name,
    issue_number: event.number,
    body,
  });

  // Mark summarized even on failure to avoid tight retry spam. The comment is
  // already posted, so a failed id write is logged, never thrown (REQ-watch-247).
  try {
    summarized.add(event.id);
  } catch (err) {
    log?.(
      `[watch] summary id write failed id=${event.id}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (res.ok) {
    log?.(
      `[watch] summary ${res.dryRun ? "dry-run" : "posted"} ${event.repo}#${event.number} id=${event.id}` +
        (res.url ? ` url=${res.url}` : ""),
    );
  } else {
    log?.(
      `[watch] summary failed ${event.repo}#${event.number} id=${event.id}: ${res.error ?? "unknown"}`,
    );
    onPostFailed?.(res);
  }
  return true;
}

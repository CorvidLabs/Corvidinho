/**
 * WATCH-RELIABILITY-1 — short summary comment after agent run finishes,
 * once per event id, only after a successful auto-ack.
 *
 * REQ-watch-231 / SAFE-6 — the summary is agent output (or its stderr) and
 * the comment is public on public repos, so it is secret-scrubbed first.
 */

import { attribution } from "../attribution.ts";
import { scrubSecrets } from "../store/scrub.ts";
import type { AckClient } from "./ack.ts";
import { isAckableEventType } from "./ack.ts";
import type { AgentSpawnResult, DetectedEvent } from "./types.ts";

/** Dedup store for event ids that already received a run-summary comment. */
export class SummarizedIdStore {
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

export function buildSummaryBody(spawn: AgentSpawnResult): string {
  const status = spawn.ok
    ? `Done (exit ${spawn.exitCode}).`
    : `Failed (exit ${spawn.exitCode}).`;
  // Scrub before clipping so a token cut at the cap leaks no prefix.
  const preview = scrubSecrets(spawn.summary || "").trim().slice(0, 1200);
  const body = preview
    ? `Corvidinho WATCH run summary — ${status}\n\n${preview}`
    : `Corvidinho WATCH run summary — ${status}`;
  const foot = attribution("markdown");
  return `${body}\n\n---\n${foot}`;
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
  log?: (msg: string) => void;
}): Promise<boolean> {
  const { event, spawn, ackClient, successfulAcks, summarized, log } = opts;

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

  const body = buildSummaryBody(spawn);
  const res = await ackClient.createIssueComment({
    owner: parts.owner,
    repo: parts.name,
    issue_number: event.number,
    body,
  });

  // Mark summarized even on failure to avoid tight retry spam.
  summarized.add(event.id);

  if (res.ok) {
    log?.(
      `[watch] summary ${res.dryRun ? "dry-run" : "posted"} ${event.repo}#${event.number} id=${event.id}` +
        (res.url ? ` url=${res.url}` : ""),
    );
  } else {
    log?.(
      `[watch] summary failed ${event.repo}#${event.number} id=${event.id}: ${res.error ?? "unknown"}`,
    );
  }
  return true;
}

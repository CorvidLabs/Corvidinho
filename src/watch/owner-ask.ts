/**
 * AGENT-16.a (#86): "When a GitHub run is stuck and needs me, it pings me on
 * Discord like other stuck asks."
 *
 * The WATCH poller and the Discord bridge are separate processes that share
 * one data dir (`CORVIDINHO_DATA_DIR`), as for GitHub forget asks
 * (MEMORY-ACL-6.a). A WATCH run that ends with a "stuck" ask (a repeated
 * failing call, AGENT-16, or verification still failing after every retry,
 * AUTONOMY-2) is handed to the bridge here, for every WATCH event type
 * (assignments and review requests post no summary comment today):
 *
 * - {@link WatchOwnerAskStore}: one pending ask per issue / PR thread in the
 *   module-owned `watch_owner_asks` table (created on first use, no schema
 *   version bump, like `watch_event_ids`). The question is the run's
 *   SAFE-6 scrubbed ask question ({@link askFromUnknown} re-normalizes it) and
 *   the table is a SAFE-6 re-scrub target. A newer ask on the thread replaces
 *   the older one; a later run on the thread that did not end stuck clears it
 *   (moot), like a schedule's newest ask (REQ-discord-347).
 * - {@link noteWatchRunAsk}: the poller's call after each run. No owner
 *   Discord id or no DB ⇒ nothing recorded and one log line saying the Discord
 *   ping could not be sent. No live bridge on this data dir
 *   ({@link bridgeRunning}) ⇒ recorded (a bridge that starts later sends it)
 *   and one log line saying the ping could not be sent now; the run summary
 *   comment, where WATCH posts one, still carries the question.
 * - The bridge marks itself running ({@link markBridgeRunning}, a
 *   `<pid>:<proc start>` id in `schema_meta`, checked with the same liveness
 *   test as schedule runners) and DMs the owner each pending ask on its
 *   scheduler tick (src/discord/watch-ask.ts, REQ-discord-086).
 *
 * AUTONOMY-8 / SAFE-8 / SAFE-14.a (#98): a WATCH run that ends stopped at a
 * spend cap (a `spend-cap` ask: no owner to raise a card, an unpriced or
 * priced call whose spend card came to no, or a setting or ledger problem)
 * is handed over the same way, so the owner hears about it on Discord
 * instead of the stop reaching nobody: the GitHub comment still says only
 * "Work is paused for budget.", and the bridge DMs the owner the stop's
 * details (amounts, caps, what the card came to) once per cap episode. The
 * card itself, when one was raised, already reached the owner through the
 * card engine while the run waited (REQ-agent-198).
 */

import type { Database } from "bun:sqlite";
import { askFromUnknown } from "../agent/ask.ts";
import type { HumanAsk } from "../agent/types.ts";
import type { OwnerRecord } from "../identity/owner.ts";
import { isScheduleRunnerAlive, scheduleRunnerId } from "../scheduler/store.ts";
import { watchThreadKey } from "../store/conversation.ts";
import { formatErrorLine } from "../store/scrub.ts";
import type { DetectedEvent } from "./types.ts";

/** `schema_meta` key naming the live bridge that delivers owner asks. */
export const BRIDGE_RUNNER_META_KEY = "discord_bridge_runner";

/** A pending ask older than this is given up (logged), never posted late. */
export const WATCH_OWNER_ASK_TTL_MS = 24 * 60 * 60 * 1000;

const WATCH_OWNER_ASKS_SQL = `
CREATE TABLE IF NOT EXISTS watch_owner_asks (
  id TEXT PRIMARY KEY NOT NULL,
  repo TEXT NOT NULL,
  number INTEGER NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  html_url TEXT NOT NULL,
  reason TEXT NOT NULL,
  question TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;

/** Create the table (idempotent; module-owned, no schema version bump). */
export function ensureWatchOwnerAsks(db: Database): void {
  db.exec(WATCH_OWNER_ASKS_SQL);
}

/** One stuck WATCH ask waiting for the bridge to DM the owner. */
export type WatchOwnerAsk = {
  /** The thread key (`issue:owner/repo#n`, {@link watchThreadKey}). */
  id: string;
  repo: string;
  number: number;
  eventId: string;
  eventType: string;
  htmlUrl: string;
  ask: HumanAsk;
  createdAt: number;
};

type Row = {
  id: string;
  repo: string;
  number: number;
  event_id: string;
  event_type: string;
  html_url: string;
  reason: string;
  question: string;
  created_at: number;
};

function fromRow(r: Row): WatchOwnerAsk | null {
  const ask = askFromUnknown({ reason: r.reason, question: r.question });
  if (!ask) return null;
  return {
    id: r.id,
    repo: r.repo,
    number: r.number,
    eventId: r.event_id,
    eventType: r.event_type,
    htmlUrl: r.html_url,
    ask,
    createdAt: r.created_at,
  };
}

/** GitHub web link of an issue or PR thread (GitHub redirects issues → pulls). */
export function threadUrl(repo: string, number: number): string {
  return `https://github.com/${repo}/issues/${number}`;
}

/** The ask reasons handed to the owner: stuck asks (AGENT-16.a) and spend-cap stops (AUTONOMY-8). */
export const WATCH_OWNER_ASK_REASONS: ReadonlySet<string> = new Set(["stuck", "spend-cap"]);

/** Pending stuck and spend-cap WATCH asks in the shared DB (see module doc). */
export class WatchOwnerAskStore {
  constructor(private readonly db: Database) {
    ensureWatchOwnerAsks(db);
  }

  /** Record (or replace) the thread's pending ask. Only "stuck" and "spend-cap" asks. */
  record(opts: {
    event: Pick<DetectedEvent, "id" | "type" | "repo" | "number" | "htmlUrl">;
    ask: HumanAsk;
    now: number;
  }): WatchOwnerAsk | null {
    const { event } = opts;
    const ask = askFromUnknown(opts.ask);
    if (!ask || !WATCH_OWNER_ASK_REASONS.has(ask.reason)) return null;
    const row: WatchOwnerAsk = {
      id: watchThreadKey(event.repo, event.number),
      repo: event.repo,
      number: event.number,
      eventId: event.id,
      eventType: event.type,
      htmlUrl: event.htmlUrl?.startsWith("https://github.com/")
        ? event.htmlUrl
        : threadUrl(event.repo, event.number),
      ask,
      createdAt: opts.now,
    };
    this.db.run(
      `INSERT INTO watch_owner_asks
         (id, repo, number, event_id, event_type, html_url, reason, question, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         repo = excluded.repo, number = excluded.number, event_id = excluded.event_id,
         event_type = excluded.event_type, html_url = excluded.html_url,
         reason = excluded.reason, question = excluded.question, created_at = excluded.created_at`,
      [
        row.id,
        row.repo,
        row.number,
        row.eventId,
        row.eventType,
        row.htmlUrl,
        ask.reason,
        ask.question,
        row.createdAt,
      ],
    );
    return row;
  }

  /** Drop the thread's pending ask (a later run there made it moot). True when one was dropped. */
  clear(repo: string, number: number): boolean {
    return this.db.run("DELETE FROM watch_owner_asks WHERE id = ?", [watchThreadKey(repo, number)]).changes > 0;
  }

  /** Pending asks, oldest first. A row whose ask no longer parses is skipped. */
  pending(): WatchOwnerAsk[] {
    const rows = this.db
      .query("SELECT * FROM watch_owner_asks ORDER BY created_at, id")
      .all() as Row[];
    return rows.map(fromRow).filter((r): r is WatchOwnerAsk => r !== null);
  }

  /** Take a pending ask (compare-and-delete): false when another poster took it or a newer one replaced it. */
  claim(a: WatchOwnerAsk): boolean {
    return (
      this.db.run("DELETE FROM watch_owner_asks WHERE id = ? AND created_at = ?", [a.id, a.createdAt])
        .changes > 0
    );
  }

  /** Hand a claimed ask back after a failed post (a newer one recorded meanwhile wins). */
  release(a: WatchOwnerAsk): void {
    this.db.run(
      `INSERT OR IGNORE INTO watch_owner_asks
         (id, repo, number, event_id, event_type, html_url, reason, question, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [a.id, a.repo, a.number, a.eventId, a.eventType, a.htmlUrl, a.ask.reason, a.ask.question, a.createdAt],
    );
  }
}

/** The bridge records that it runs and delivers owner asks on this data dir. */
export function markBridgeRunning(db: Database, runner: string = scheduleRunnerId()): string {
  db.run(
    `INSERT INTO schema_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [BRIDGE_RUNNER_META_KEY, runner],
  );
  return runner;
}

/** A stopping bridge removes its mark (only when it still names this bridge). */
export function clearBridgeRunning(db: Database, runner: string): void {
  db.run("DELETE FROM schema_meta WHERE key = ? AND value = ?", [BRIDGE_RUNNER_META_KEY, runner]);
}

/** True while a bridge that marked itself on this data dir still runs. */
export function bridgeRunning(
  db: Database,
  isAlive: (runner: string) => boolean = isScheduleRunnerAlive,
): boolean {
  const row = db
    .query("SELECT value FROM schema_meta WHERE key = ?")
    .get(BRIDGE_RUNNER_META_KEY) as { value: string } | null;
  const runner = row?.value?.trim() ?? "";
  return runner.length > 0 && isAlive(runner);
}

export type WatchRunAskOutcome =
  /** Not a stuck or spend-cap ask; a pending ask on the thread (if any) was dropped. */
  | { kind: "none"; cleared: boolean }
  /** Recorded; a live bridge will DM the owner. */
  | { kind: "queued" }
  /** Recorded, but no live bridge on this data dir: sent when one starts. */
  | { kind: "no-bridge" }
  /** Not recorded: no owner Discord id, or no DB. */
  | { kind: "not-sent"; why: "no-owner" | "no-db" };

/**
 * After a WATCH run (every event type): a stuck ask (AGENT-16.a) or a
 * spend-cap stop (AUTONOMY-8) is handed to the bridge for the owner's
 * Discord DM; any other outcome makes the thread's pending ask moot. Logs one
 * line for a handed-over ask (a spend-cap line names no amount). Never
 * throws.
 */
export function noteWatchRunAsk(opts: {
  db: Database | undefined;
  owner: OwnerRecord | null | undefined;
  event: Pick<DetectedEvent, "id" | "type" | "repo" | "number" | "htmlUrl">;
  ask: HumanAsk | undefined;
  /** The run summary comment (which carries the question) went out. */
  summaryPosted: boolean;
  now: number;
  log: (msg: string) => void;
  isAlive?: (runner: string) => boolean;
}): WatchRunAskOutcome {
  const { db, event, log } = opts;
  const spendCap = opts.ask?.reason === "spend-cap";
  // SAFE-14.a: a spend-cap stop's comment says only "Work is paused for budget."
  const what = spendCap ? "spend-cap stop" : "stuck ask";
  const why = spendCap ? "AUTONOMY-8" : "AGENT-16.a";
  const where = `${event.repo}#${event.number} id=${event.id}`;
  const onGithub = spendCap
    ? "GitHub shows only that work is paused for budget (SAFE-14.a)"
    : opts.summaryPosted
    ? "the run summary comment carries the question"
    : "no comment on GitHub carries the question";
  const ping = spendCap ? "the owner's Discord DM" : "the owner's Discord ping";
  try {
    if (!opts.ask || !WATCH_OWNER_ASK_REASONS.has(opts.ask.reason)) {
      const cleared = db ? new WatchOwnerAskStore(db).clear(event.repo, event.number) : false;
      return { kind: "none", cleared };
    }
    const ownerId = opts.owner?.discordId?.trim();
    if (!ownerId || !db) {
      const reason = !ownerId ? "no-owner" : "no-db";
      log(
        `[watch] ${what} ${where}: ${ping} could not be sent — ` +
          (reason === "no-owner"
            ? "no owner Discord id is configured (IDENTITY-3)"
            : "no shared DB to hand it to the bridge") +
          `; ${onGithub} (${why})`,
      );
      return { kind: "not-sent", why: reason };
    }
    new WatchOwnerAskStore(db).record({ event, ask: opts.ask, now: opts.now });
    if (!bridgeRunning(db, opts.isAlive)) {
      log(
        `[watch] ${what} ${where}: ${ping} could not be sent — no Discord bridge is running ` +
          `on this data dir (CORVIDINHO_DATA_DIR); it is sent if one starts within a day; ${onGithub} (${why})`,
      );
      return { kind: "no-bridge" };
    }
    log(`[watch] ${what} ${where}: queued for ${ping} (${why})`);
    return { kind: "queued" };
  } catch (err) {
    log(
      `[watch] ${what} ${where}: ${ping} could not be sent — recording it failed: ${formatErrorLine(err)}`,
    );
    return { kind: "not-sent", why: "no-db" };
  }
}

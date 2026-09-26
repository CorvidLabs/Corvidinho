/**
 * In-flight Discord replies and restart recovery (DISCORD-3 / AGENT-3,
 * REQ-discord-311).
 *
 * The bridge records one row while it works on a reply to a message (the
 * progress embed id is filled in once that embed is sent) and deletes it on
 * every exit path. A row still present at bridge start belongs to a process
 * that died mid-reply (update SIGTERM, crash, OOM): its progress embed is
 * frozen at "working…". Startup recovery turns that embed into a failed
 * "interrupted" status, or replies to the request message when the edit is
 * not possible, then deletes the row.
 *
 * Recovery only touches the row's own channel (where the reply was going) and
 * only the bot's own progress message or a reply to the recorded request
 * message. Rows hold ids and a timestamp, never message text.
 */

import type { Database } from "bun:sqlite";
import {
  buildThinkingEmbed,
  type DiscordEmbedPayload,
  type ThinkingOutbound,
} from "./thinking-status.ts";

export type InflightReply = {
  id: string;
  sessionId: string;
  /** Channel or thread the reply is posted in. */
  channelId: string;
  /** The bot's progress embed; null until it has been sent. */
  progressMessageId: string | null;
  /** The user message being replied to. */
  requestMessageId: string;
  startedAt: number;
};

/** What the user sees for a reply the bridge could not finish. */
export const INTERRUPTED_REPLY_TEXT =
  "interrupted: Corvidinho restarted before this reply finished — please send it again";

/** Same wording in the embed and the fallback reply. */
export const INTERRUPTED_REPLY_STATUS = `❌ ${INTERRUPTED_REPLY_TEXT}`;

function newId(): string {
  return `reply_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

type Row = {
  id: string;
  session_id: string;
  channel_id: string;
  progress_message_id: string | null;
  request_message_id: string;
  started_at: number;
};

function fromRow(r: Row): InflightReply {
  return {
    id: r.id,
    sessionId: r.session_id,
    channelId: r.channel_id,
    progressMessageId: r.progress_message_id,
    requestMessageId: r.request_message_id,
    startedAt: r.started_at,
  };
}

/** `discord_inflight_replies` (schema v9) in the shared Corvidinho DB. */
export class InflightReplyStore {
  constructor(
    private readonly db: Database,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Record a reply that is starting (before its progress embed is sent). */
  begin(input: {
    sessionId: string;
    channelId: string;
    requestMessageId: string;
  }): InflightReply {
    const row: InflightReply = {
      id: newId(),
      sessionId: input.sessionId,
      channelId: input.channelId,
      progressMessageId: null,
      requestMessageId: input.requestMessageId,
      startedAt: this.now(),
    };
    this.db.run(
      `INSERT INTO discord_inflight_replies
         (id, session_id, channel_id, progress_message_id, request_message_id, started_at)
       VALUES (?, ?, ?, NULL, ?, ?)`,
      [row.id, row.sessionId, row.channelId, row.requestMessageId, row.startedAt],
    );
    return row;
  }

  /** Remember the progress embed once it has been sent. */
  setProgressMessage(id: string, progressMessageId: string): void {
    this.db.run(
      "UPDATE discord_inflight_replies SET progress_message_id = ? WHERE id = ?",
      [progressMessageId, id],
    );
  }

  /** The reply finished (done, failed or refused): forget it. */
  end(id: string): void {
    this.db.run("DELETE FROM discord_inflight_replies WHERE id = ?", [id]);
  }

  /** Every recorded reply, oldest first. */
  list(): InflightReply[] {
    const rows = this.db
      .query(
        `SELECT id, session_id, channel_id, progress_message_id,
                request_message_id, started_at
         FROM discord_inflight_replies
         ORDER BY started_at, id`,
      )
      .all() as Row[];
    return rows.map(fromRow);
  }
}

/** Failed-status embed for an interrupted reply (ThinkingStatus fail styling). */
export function buildInterruptedEmbed(row: InflightReply): DiscordEmbedPayload {
  return buildThinkingEmbed({
    phase: "error",
    description: INTERRUPTED_REPLY_STATUS,
    sessionId: row.sessionId,
  });
}

export type RecoverInterruptedRepliesOptions = {
  store: InflightReplyStore;
  /** Rows to recover (a snapshot taken before new replies start). */
  rows: readonly InflightReply[];
  editEmbed?: ThinkingOutbound["editEmbed"];
  reply?: (opts: {
    channelId: string;
    content: string;
    replyToMessageId?: string;
  }) => Promise<{ messageId: string } | null>;
};

export type RecoverInterruptedRepliesResult = {
  /** Progress embed edited to the interrupted status. */
  edited: number;
  /** Edit not possible; replied to the request message instead. */
  replied: number;
  /** Neither worked (the row is still removed). */
  failed: number;
};

/**
 * Tell users about replies a dead process left unfinished. Sequential (one
 * Discord call at a time), best effort, never throws; every row is deleted.
 */
export async function recoverInterruptedReplies(
  opts: RecoverInterruptedRepliesOptions,
): Promise<RecoverInterruptedRepliesResult> {
  const result: RecoverInterruptedRepliesResult = {
    edited: 0,
    replied: 0,
    failed: 0,
  };
  for (const row of opts.rows) {
    let edited = false;
    if (row.progressMessageId && opts.editEmbed) {
      try {
        edited = await opts.editEmbed({
          channelId: row.channelId,
          messageId: row.progressMessageId,
          embed: buildInterruptedEmbed(row),
        });
      } catch {
        edited = false;
      }
    }
    let replied = false;
    if (!edited && opts.reply) {
      try {
        const sent = await opts.reply({
          channelId: row.channelId,
          content: INTERRUPTED_REPLY_STATUS,
          replyToMessageId: row.requestMessageId,
        });
        replied = sent != null;
      } catch {
        replied = false;
      }
    }
    if (edited) result.edited += 1;
    else if (replied) result.replied += 1;
    else result.failed += 1;
    try {
      opts.store.end(row.id);
    } catch {
      // Best effort: a row that cannot be deleted is retried next start.
    }
  }
  return result;
}

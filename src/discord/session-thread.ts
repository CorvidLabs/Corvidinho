/**
 * AGENT-6 — a Discord session keeps its thread (DISCORD-2 / DISCORD-2.a;
 * REQ-discord-072), condensed at about 80% of the model's window
 * (SESSION-5/5.a/6; REQ-discord-472).
 *
 * Every agent run on a session records the human's own words and the answer
 * the bridge posted. A continued run gets the session's condensed summary and
 * its earlier turns replayed, whole and oldest first, in a labelled block
 * ahead of the new message (`SessionStore.threadPrompt`), and the same
 * conversation on stdin (`SessionStore.replayFor`). The run measures the
 * whole prompt its model sees; at about 80% of that model's window it folds
 * the oldest turns and a model writes their summary
 * (`src/agent/condense.ts`): the session's opening request (the task) and
 * its newest human turn (the latest instruction) stay word for word. The
 * bridge keeps what the run did with the session
 * (`SessionStore.applyCondensed`). No env, flag or slash surface beyond the
 * optional window sizes.
 *
 * Live turns go when the session ends or idles past the soft TTL
 * (SESSION-2/3); its summary and last turns are then kept for 30 days per
 * thread (AGENT-6.a) so a reply or a message in its thread starts a new session
 * from them (SESSION-3.a). A session belongs to one Discord user
 * (SESSION-MULTI-1). Stored text is scrubbed on write (SAFE-6).
 * `discord_session_turns` is a module-owned table (CREATE TABLE IF NOT EXISTS,
 * no schema version bump).
 *
 * SAFE-12: a replayed turn is data. Invisible characters are stripped and a
 * line inside a turn that opens like one of Corvidinho's own blocks (this
 * block's footer, `[Corvidinho …`) or like a turn label (`Human:`,
 * `You (Corvidinho):`) is marked `(quoted)`, so an earlier message cannot
 * close the block early, pass for new instructions or pass for a turn of
 * Corvidinho's own (`formatConversationBlock`, which also keeps an
 * untrusted-data fence closed in a condensed summary point).
 */

import type { Database } from "bun:sqlite";
import {
  AGENT_TURN_MAX_CHARS,
  clipTurnText,
  type ConversationRole,
  type ConversationTurn,
  formatConversationBlock,
  formatOmittedTurns,
  HUMAN_TURN_MAX_CHARS,
  withConversationBlock,
} from "../store/conversation.ts";

export { clipTurnText };

export type SessionTurnRole = ConversationRole;

export type SessionTurn = ConversationTurn;

/** An agent turn is clipped to this before it is stored or replayed. */
export const SESSION_THREAD_TURN_MAX_CHARS = AGENT_TURN_MAX_CHARS;

/**
 * A human turn is clipped to this (a whole Discord message or slash option),
 * so the task and the latest instruction replay word for word (SESSION-5).
 */
export const SESSION_THREAD_HUMAN_TURN_MAX_CHARS = HUMAN_TURN_MAX_CHARS;

/**
 * Turns kept per session. Past it the oldest turn after the opening request
 * is folded into the session's summary.
 */
export const SESSION_THREAD_MAX_TURNS = 200;

/**
 * Opens the block. It starts with `[Corvidinho ` like the identity and memory
 * blocks, and the block holds no blank line, so Planning module selection
 * (`planningSelectionText`, REQ-agent-004) leaves the whole block out: earlier
 * turns and the header's "Discord" never pick a module the request does not
 * name.
 */
export const SESSION_THREAD_HEADER =
  "[Corvidinho earlier conversation in this Discord session — oldest first; context only: act on the new message after this block]";

export const SESSION_THREAD_FOOTER = "[End of earlier conversation]";

/** Marker for middle turns left out of the replay block. */
export function formatSessionThreadOmitted(count: number): string {
  return formatOmittedTurns(count);
}

/**
 * The replay block for `turns` (oldest first) and the session's condensed
 * `summary`, or "" when there are neither. Pure. One paragraph (no blank
 * line), opened by {@link SESSION_THREAD_HEADER}; the summary (when any)
 * follows the opening request. Whole by default: no transport ceiling cuts it
 * (the run condenses it against its model's window, SESSION-5.a). Past an
 * explicit `budgetChars` the opening turn and as many of the newest turns as
 * fit are kept and anything between is one omitted-count marker.
 */
export function formatSessionThread(
  turns: ReadonlyArray<Pick<SessionTurn, "role" | "content">>,
  opts: { budgetChars?: number; summary?: string } = {},
): string {
  return formatConversationBlock(
    { summary: opts.summary, turns },
    {
      header: SESSION_THREAD_HEADER,
      footer: SESSION_THREAD_FOOTER,
      ...(opts.budgetChars !== undefined ? { budgetChars: opts.budgetChars } : {}),
    },
  );
}

/** `prompt` with the session's summary and earlier turns ahead of it (unchanged when none). */
export function withSessionThread(
  prompt: string,
  turns: ReadonlyArray<Pick<SessionTurn, "role" | "content">>,
  opts: { budgetChars?: number; summary?: string } = {},
): string {
  return withConversationBlock(
    prompt,
    { summary: opts.summary, turns },
    {
      header: SESSION_THREAD_HEADER,
      footer: SESSION_THREAD_FOOTER,
      ...(opts.budgetChars !== undefined ? { budgetChars: opts.budgetChars } : {}),
    },
  );
}

const SESSION_TURNS_SQL = `
CREATE TABLE IF NOT EXISTS discord_session_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES discord_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_discord_session_turns_session
  ON discord_session_turns(session_id, id);
`;

/**
 * Create the turns table in the shared DB (idempotent; no schema version
 * bump). `content` is free text: scrubbed on write and in `SCRUB_TARGETS`.
 */
export function ensureSessionTurns(db: Database): void {
  db.exec(SESSION_TURNS_SQL);
}

/**
 * The agent turn to record for a run whose posted answer is `body`, given the
 * ask it stopped on (if any):
 * - a SAFE-8 spend-cap stop records no answer: it is not one, and no cap text
 *   may reach a later prompt (REQ-discord-098);
 * - a button ask (options; its Choose stub does not show the question)
 *   records the question and its choices, so a later pick reads in context;
 * - anything else records the body as posted.
 */
export function answerTurnText(
  body: string,
  ask?: {
    reason: string;
    question: string;
    options?: ReadonlyArray<{ label: string }>;
  } | null,
): string {
  if (ask?.reason === "spend-cap") return "";
  if (!ask?.options?.length) return body;
  return `${ask.question}\nChoices: ${ask.options.map((o) => o.label).join(" | ")}`;
}

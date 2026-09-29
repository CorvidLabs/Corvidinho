/**
 * AGENT-6 — a Discord session keeps its thread (DISCORD-2 / DISCORD-2.a;
 * REQ-discord-072).
 *
 * Every agent run on a session records the human's own words and the answer
 * the bridge posted. A continued run gets those earlier turns replayed, oldest
 * first, in a labelled block ahead of the new message. The block has a fixed
 * character budget: the session's opening request and the newest turns are
 * kept, and middle turns that do not fit are replaced by a count marker. No
 * model summarising; no env, flag or slash surface.
 *
 * Turns live only as long as their session: they go when the session ends or
 * idles past the soft TTL (SESSION-2/3; later continuity comes from MEMORY,
 * SESSION-4), and a session belongs to one Discord user (SESSION-MULTI-1).
 * Stored text is scrubbed on write (SAFE-6). `discord_session_turns` is a
 * module-owned table (CREATE TABLE IF NOT EXISTS, no schema version bump).
 *
 * SAFE-12: a replayed turn is data. Invisible characters are stripped and a
 * line inside a turn that opens like one of Corvidinho's own blocks (this
 * block's footer, `[Corvidinho …`) or like a turn label (`Human:`,
 * `You (Corvidinho):`) is marked `(quoted)`, so an earlier message cannot
 * close the block early, pass for new instructions or pass for a turn of
 * Corvidinho's own.
 */

import type { Database } from "bun:sqlite";
import { defangContextMarkers, stripInvisible } from "../agent/untrusted.ts";

export type SessionTurnRole = "human" | "agent";

export type SessionTurn = {
  role: SessionTurnRole;
  /** Scrubbed text, at most {@link SESSION_THREAD_TURN_MAX_CHARS}. */
  content: string;
  createdAt: number;
};

/** Whole replay block (header and footer included) never exceeds this. */
export const SESSION_THREAD_BUDGET_CHARS = 6000;

/** One turn is clipped to this before it is stored or replayed. */
export const SESSION_THREAD_TURN_MAX_CHARS = 1500;

/**
 * Turns kept per session. Past it the oldest turn after the opening request
 * is dropped (the budget could never show it next to the newest turns).
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

const ROLE_LABEL: Record<SessionTurnRole, string> = {
  human: "Human",
  agent: "You (Corvidinho)",
};

/** Marker for middle turns left out of the replay block. */
export function formatSessionThreadOmitted(count: number): string {
  return `(${count} earlier turn${count === 1 ? "" : "s"} omitted)`;
}

/**
 * Clip one turn's text to `max` characters (ellipsis when cut), never ending
 * on half a surrogate pair.
 */
export function clipTurnText(text: string, max = SESSION_THREAD_TURN_MAX_CHARS): string {
  const t = text.trim();
  if (t.length <= max) return t;
  let end = Math.max(0, max - 1);
  const last = t.charCodeAt(end - 1);
  if (end > 0 && last >= 0xd800 && last <= 0xdbff) end -= 1;
  return `${t.slice(0, end)}…`;
}

/** Blank lines inside a turn, collapsed so the block stays one paragraph. */
const BLANK_LINES_RE = /\r?\n(?:[ \t]*\r?\n)+/g;

/** A line inside a turn that opens like a turn label (`Human:`, `You (Corvidinho):`). */
const TURN_LABEL_LINE_RE = /^([ \t]{0,16})((?:human|you[ \t]{0,3}\([ \t]{0,3}corvidinho[ \t]{0,3}\))[ \t]{0,3}:)/gimu;

function turnLine(turn: Pick<SessionTurn, "role" | "content">): string {
  const text = defangContextMarkers(stripInvisible(clipTurnText(turn.content)))
    .replace(TURN_LABEL_LINE_RE, "$1(quoted) $2")
    .replace(BLANK_LINES_RE, "\n");
  return `${ROLE_LABEL[turn.role]}: ${text}`;
}

/**
 * The replay block for `turns` (oldest first), or "" when there are none.
 * Pure. One paragraph (no blank line), opened by {@link SESSION_THREAD_HEADER}.
 * The opening turn (the session's opening request) is always kept, then
 * as many of the newest turns as fit in `budgetChars`; anything between is one
 * omitted-count marker. With the default budget and per-turn clip the block
 * always fits and always holds the newest turn.
 */
export function formatSessionThread(
  turns: ReadonlyArray<Pick<SessionTurn, "role" | "content">>,
  opts: { budgetChars?: number } = {},
): string {
  const lines = turns.filter((t) => t.content.trim()).map(turnLine);
  if (lines.length === 0) return "";
  const budget = opts.budgetChars ?? SESSION_THREAD_BUDGET_CHARS;
  const wrap = (body: string[]) =>
    [SESSION_THREAD_HEADER, ...body, SESSION_THREAD_FOOTER].join("\n");

  const whole = wrap(lines);
  if (whole.length <= budget) return whole;

  const [opening, ...rest] = lines as [string, ...string[]];
  // Room for the header, footer, opening turn and the widest marker, each on
  // its own line.
  let room =
    budget -
    SESSION_THREAD_HEADER.length -
    SESSION_THREAD_FOOTER.length -
    opening.length -
    formatSessionThreadOmitted(rest.length).length -
    3;
  const newest: string[] = [];
  for (let i = rest.length - 1; i >= 0; i -= 1) {
    const line = rest[i]!;
    if (line.length + 1 > room) break;
    newest.unshift(line);
    room -= line.length + 1;
  }
  const omitted = rest.length - newest.length;
  return wrap([
    opening,
    ...(omitted > 0 ? [formatSessionThreadOmitted(omitted)] : []),
    ...newest,
  ]);
}

/** `prompt` with the session's earlier turns ahead of it (unchanged when none). */
export function withSessionThread(
  prompt: string,
  turns: ReadonlyArray<Pick<SessionTurn, "role" | "content">>,
  opts: { budgetChars?: number } = {},
): string {
  const block = formatSessionThread(turns, opts);
  return block ? `${block}\n\n${prompt}` : prompt;
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

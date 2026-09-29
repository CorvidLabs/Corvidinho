/**
 * Condensed conversations (SESSION-5 / SESSION-6 / SESSION-3.a / AGENT-6.a;
 * REQ-discord-472, REQ-watch-472).
 *
 * A conversation is a condensed `summary` plus its recent `turns`, oldest
 * first. When the prompt a run would get (the replayed conversation and the
 * new message) reaches about 80% of the model's context window, the oldest
 * turns are folded into the summary one at a time until it fits again. The
 * current task (the conversation's opening human turn) and its latest
 * instruction (the newest human turn) are never folded, so they stay word for
 * word (secret-scrubbed, SAFE-6). The fold is extractive and deterministic:
 * each folded turn becomes one short point of its own words; no model call.
 *
 * The window comes from `CORVIDINHO_LLM_CONTEXT_TOKENS` (tokens), else
 * {@link CONTEXT_WINDOW_DEFAULT_TOKENS}; tokens use the chars/4 estimate
 * Corvidinho uses elsewhere (PLUGIN-6). The prompt reaches the agent as one
 * process argument, which Linux caps at 128 KiB, so the conversation part is
 * never allowed past {@link CONVERSATION_PROMPT_MAX_CHARS} whatever the window.
 *
 * `ConversationStore` keeps each thread's summary and last
 * {@link CONVERSATION_KEEP_TURNS} turns (scrubbed) in `conversation_threads`
 * (schema v12) for {@link CONVERSATION_RETENTION_MS} after its last update,
 * then purges it: a Discord session's summary lives there while the session
 * is live and its whole conversation is kept there when it ends or idles out
 * (so a reply after the soft TTL starts a new session from it), and WATCH
 * keeps one per issue or PR. `deleteForPerson` is the per-person delete the
 * forget-me flow (MEMORY-ACL-6) calls.
 */

import type { Database } from "bun:sqlite";
import { scrubSecrets } from "./scrub.ts";

export type ConversationRole = "human" | "agent";

export type ConversationTurn = {
  role: ConversationRole;
  /** Scrubbed text, clipped by role ({@link clipTurnForRole}). */
  content: string;
  createdAt: number;
};

export type Conversation = {
  /** Condensed earlier turns: one `- Label: words` point per line. */
  summary: string;
  turns: ConversationTurn[];
};

/** Env key for the model's context window, in tokens (optional). */
export const CONTEXT_WINDOW_ENV = "CORVIDINHO_LLM_CONTEXT_TOKENS";

/** Window used when `CORVIDINHO_LLM_CONTEXT_TOKENS` is unset or not a positive integer. */
export const CONTEXT_WINDOW_DEFAULT_TOKENS = 8192;

/** A configured window below this is raised to it. */
export const CONTEXT_WINDOW_MIN_TOKENS = 1024;

/** SESSION-5: condense when the prompt reaches this share of the window. */
export const CONDENSE_AT_FRACTION = 0.8;

/** Rough token estimate: chars / 4, as `approxTokens` (PLUGIN-6). */
export const CHARS_PER_TOKEN = 4;

/**
 * Transport ceiling for the conversation part of the prompt (replayed block
 * plus the new message): the prompt is one `--task` argument, and Linux caps
 * one argument at 128 KiB. 32,000 UTF-16 chars stay under 96 KB of UTF-8,
 * leaving room for the identity and memory blocks.
 */
export const CONVERSATION_PROMPT_MAX_CHARS = 32_000;

/** AGENT-6.a: a thread's summary and recent turns are kept this long after its last update. */
export const CONVERSATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** AGENT-6.a: recent turns kept word for word in a retained conversation. */
export const CONVERSATION_KEEP_TURNS = 20;

/** Bot message ids remembered per retained Discord conversation (SESSION-3.a replies). */
export const CONVERSATION_KEEP_BOT_MESSAGES = 100;

/** An agent turn is clipped to this before it is stored or replayed. */
export const AGENT_TURN_MAX_CHARS = 1500;

/**
 * A human turn is clipped to this: above Discord's longest input (a 6000-char
 * slash option; a message is at most 4000), so the task and the latest
 * instruction are kept whole and pinned word for word (SESSION-5).
 */
export const HUMAN_TURN_MAX_CHARS = 6000;

/** One summary point keeps at most this many chars of the folded turn. */
export const SUMMARY_POINT_MAX_CHARS = 160;

/** Over the summary cap, older points are shortened to this before any is left out. */
export const SUMMARY_POINT_MIN_CHARS = 80;

/** The summary never grows past this (and never past a quarter of the budget). */
export const SUMMARY_MAX_CHARS = 6000;

const SUMMARY_FLOOR_CHARS = 500;

/** First line of the summary once its oldest points were left out to stay bounded. */
const SUMMARY_DROPPED_RE = /^\((\d+) earlier points? left out\)$/;

export const ROLE_LABEL: Record<ConversationRole, string> = {
  human: "Human",
  agent: "You (Corvidinho)",
};

/**
 * The model's context window in tokens: `CORVIDINHO_LLM_CONTEXT_TOKENS` when it
 * is a positive integer (raised to {@link CONTEXT_WINDOW_MIN_TOKENS}), else
 * {@link CONTEXT_WINDOW_DEFAULT_TOKENS}.
 */
export function resolveContextWindowTokens(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env[CONTEXT_WINDOW_ENV]?.trim();
  if (!raw || !/^\d+$/.test(raw)) return CONTEXT_WINDOW_DEFAULT_TOKENS;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) return CONTEXT_WINDOW_DEFAULT_TOKENS;
  return Math.max(CONTEXT_WINDOW_MIN_TOKENS, n);
}

/**
 * Chars the conversation part of the prompt may take before it is condensed:
 * 80% of the window (chars/4 tokens), never past the transport ceiling.
 */
export function condenseBudgetChars(windowTokens: number): number {
  const tokens = Math.floor(
    Math.max(CONTEXT_WINDOW_MIN_TOKENS, windowTokens) * CONDENSE_AT_FRACTION,
  );
  return Math.min(CONVERSATION_PROMPT_MAX_CHARS, tokens * CHARS_PER_TOKEN);
}

/** Tokens for `text` by the chars/4 estimate. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Clip `text` to `max` characters (ellipsis when cut), never ending on half a
 * surrogate pair.
 */
export function clipTurnText(text: string, max = AGENT_TURN_MAX_CHARS): string {
  const t = text.trim();
  if (t.length <= max) return t;
  let end = Math.max(0, max - 1);
  const last = t.charCodeAt(end - 1);
  if (end > 0 && last >= 0xd800 && last <= 0xdbff) end -= 1;
  return `${t.slice(0, end)}…`;
}

/** Clip for a turn of `role`: human turns keep a whole Discord input. */
export function clipTurnForRole(role: ConversationRole, text: string): string {
  return clipTurnText(text, role === "human" ? HUMAN_TURN_MAX_CHARS : AGENT_TURN_MAX_CHARS);
}

/** Blank lines inside a turn, collapsed so the block stays one paragraph. */
const BLANK_LINES_RE = /\r?\n(?:[ \t]*\r?\n)+/g;

function turnLine(turn: Pick<ConversationTurn, "role" | "content">): string {
  const text = clipTurnForRole(turn.role, turn.content).replace(BLANK_LINES_RE, "\n");
  return `${ROLE_LABEL[turn.role]}: ${text}`;
}

/** Label line ahead of the summary points in a replayed block. */
export const SUMMARY_LABEL =
  "Condensed summary of earlier turns (the task, the latest instruction and the newest turns are word for word):";

/** Marker for middle turns left out of a replay block that still does not fit. */
export function formatOmittedTurns(count: number): string {
  return `(${count} earlier turn${count === 1 ? "" : "s"} omitted)`;
}

/**
 * The replay block for a conversation (`turns` oldest first), or "" when it
 * has no summary and no turns. Pure. One paragraph (no blank line) opened by
 * `header` and closed by `footer`. With a summary, the label and its points
 * follow the opening human turn (the task), else lead the block, and the
 * kept turns follow. When `budgetChars` is set and the block is still over it, the
 * opening turn and as many newest turns as fit are kept and one omitted-count
 * marker stands for the rest (a callers' safety net: condensation normally
 * keeps it within budget).
 */
export function formatConversationBlock(
  conversation: { summary?: string; turns: ReadonlyArray<Pick<ConversationTurn, "role" | "content">> },
  opts: { header: string; footer: string; budgetChars?: number },
): string {
  const summaryLines = summaryPoints(conversation.summary ?? "");
  const head = summaryLines.length > 0 ? [SUMMARY_LABEL, ...summaryLines] : [];
  const kept = conversation.turns.filter((t) => t.content.trim());
  const lines = kept.map(turnLine);
  if (head.length === 0 && lines.length === 0) return "";
  // The opening human turn (the task) came before the turns the summary
  // condenses, so it goes first; otherwise the summary leads.
  const taskFirst = kept[0]?.role === "human";
  const wrap = (body: string[]) =>
    taskFirst && body.length > 0
      ? [opts.header, body[0]!, ...head, ...body.slice(1), opts.footer].join("\n")
      : [opts.header, ...head, ...body, opts.footer].join("\n");

  const whole = wrap(lines);
  const budget = opts.budgetChars;
  if (budget === undefined || whole.length <= budget || lines.length === 0) return whole;

  const [opening, ...rest] = lines as [string, ...string[]];
  const headChars = head.reduce((n, l) => n + l.length + 1, 0);
  // Room for the header, footer, summary, opening turn and the widest marker,
  // each on its own line.
  let room =
    budget -
    opts.header.length -
    opts.footer.length -
    headChars -
    opening.length -
    formatOmittedTurns(rest.length).length -
    3;
  const newest: string[] = [];
  for (let i = rest.length - 1; i >= 0; i -= 1) {
    const line = rest[i]!;
    if (line.length + 1 > room) break;
    newest.unshift(line);
    room -= line.length + 1;
  }
  const omitted = rest.length - newest.length;
  return wrap([opening, ...(omitted > 0 ? [formatOmittedTurns(omitted)] : []), ...newest]);
}

/** `prompt` with the conversation block ahead of it (unchanged when there is none). */
export function withConversationBlock(
  prompt: string,
  conversation: { summary?: string; turns: ReadonlyArray<Pick<ConversationTurn, "role" | "content">> },
  opts: { header: string; footer: string; budgetChars?: number },
): string {
  const block = formatConversationBlock(conversation, opts);
  return block ? `${block}\n\n${prompt}` : prompt;
}

/** The summary's points, one per line, blank lines dropped. */
function summaryPoints(summary: string): string[] {
  return summary
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** One summary point for a folded turn: its label and its opening words. */
export function summaryPoint(turn: Pick<ConversationTurn, "role" | "content">): string {
  const words = turn.content.replace(/\s+/g, " ").trim();
  return `- ${ROLE_LABEL[turn.role]}: ${clipTurnText(words, SUMMARY_POINT_MAX_CHARS)}`;
}

/** Summary size cap for a budget: a third of it, within [500, SUMMARY_MAX_CHARS]. */
export function summaryCapChars(budgetChars: number): number {
  return Math.max(SUMMARY_FLOOR_CHARS, Math.min(SUMMARY_MAX_CHARS, Math.floor(budgetChars / 3)));
}

/**
 * `summary` with `points` appended, bounded to `capChars`: past the cap the
 * oldest points are first shortened to {@link SUMMARY_POINT_MIN_CHARS}, then
 * left out, one `(N earlier points left out)` line counting them. Scrubbed
 * (SAFE-6).
 */
export function appendSummary(summary: string, points: readonly string[], capChars: number): string {
  let lines = summaryPoints(summary);
  let dropped = 0;
  const m = lines[0]?.match(SUMMARY_DROPPED_RE);
  if (m) {
    dropped = Number(m[1]);
    lines = lines.slice(1);
  }
  lines.push(...points.map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean));
  const render = () =>
    [...(dropped > 0 ? [`(${dropped} earlier point${dropped === 1 ? "" : "s"} left out)`] : []), ...lines].join("\n");
  for (let i = 0; i < lines.length - 1 && render().length > capChars; i += 1) {
    if (lines[i]!.length > SUMMARY_POINT_MIN_CHARS) {
      lines[i] = clipTurnText(lines[i]!.replace(/…$/, ""), SUMMARY_POINT_MIN_CHARS);
    }
  }
  while (lines.length > 1 && render().length > capChars) {
    lines.shift();
    dropped += 1;
  }
  return scrubSecrets(render());
}

/**
 * Turn indexes that are never folded: the opening human turn (the current
 * task) and the newest human turn (its latest instruction).
 */
export function pinnedTurnIndexes(turns: ReadonlyArray<Pick<ConversationTurn, "role">>): Set<number> {
  const pinned = new Set<number>();
  if (turns[0]?.role === "human") pinned.add(0);
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (turns[i]!.role === "human") {
      pinned.add(i);
      break;
    }
  }
  return pinned;
}

/**
 * Fold the oldest unpinned turns of `conversation` into its summary while the
 * prompt (`render(conversation)` plus a blank line plus `incoming`, the new
 * message, which is never touched) is at or over `budgetChars`. Pure: returns
 * the new conversation and the turns folded (empty when it already fits).
 */
export function condenseConversation(input: {
  conversation: Conversation;
  incoming: string;
  budgetChars: number;
  render: (c: Conversation) => string;
}): Conversation & { folded: ConversationTurn[] } {
  let summary = input.conversation.summary;
  const turns = [...input.conversation.turns];
  const folded: ConversationTurn[] = [];
  const cap = summaryCapChars(input.budgetChars);
  const size = () => {
    const block = input.render({ summary, turns });
    return (block ? block.length + 2 : 0) + input.incoming.length;
  };
  while (size() >= input.budgetChars) {
    const pinned = pinnedTurnIndexes(turns);
    const i = turns.findIndex((_, idx) => !pinned.has(idx));
    if (i < 0) break;
    const [turn] = turns.splice(i, 1);
    folded.push(turn!);
    summary = appendSummary(summary, [summaryPoint(turn!)], cap);
  }
  // Only the pinned turns are left and it is still over: the summary gives
  // way (oldest points shortened, then left out), never the pinned words.
  const over = size() - input.budgetChars + 1;
  if (over > 0 && folded.length > 0 && summary) {
    summary = appendSummary(summary, [], Math.max(0, summary.length - over));
  }
  return { summary, turns, folded };
}

/**
 * Keep at most `keep` turns: the opening human turn (pinned) and the newest
 * ones; the turns between are folded into the summary. For a retained
 * conversation (AGENT-6.a) and a session's turn cap.
 */
export function boundConversation(
  conversation: Conversation,
  keep: number,
  capChars = SUMMARY_MAX_CHARS,
): Conversation & { folded: ConversationTurn[] } {
  const turns = [...conversation.turns];
  if (turns.length <= keep) return { ...conversation, turns, folded: [] };
  const pinOpening = turns[0]?.role === "human" ? 1 : 0;
  const drop = turns.length - keep;
  const folded = turns.splice(pinOpening, drop);
  const summary = appendSummary(conversation.summary, folded.map(summaryPoint), capChars);
  return { summary, turns, folded };
}

// ---------------------------------------------------------------------------
// Retained conversations (conversation_threads, schema v12)
// ---------------------------------------------------------------------------

export type ConversationSurface = "discord" | "watch";

export type ConversationRecord = {
  id: string;
  surface: ConversationSurface;
  /** `thread:<id>` / `channel:<id>` (Discord), `issue:<owner/repo#n>` (WATCH). */
  threadKey: string;
  /** The person: Discord user id, or lowercased GitHub login for WATCH. */
  userId: string;
  /** The session that last carried it. */
  sessionId?: string;
  summary: string;
  turns: ConversationTurn[];
  /** Qualified ids of everyone whose words it holds (`discord:<id>`, `github:<login>`). */
  participants: string[];
  /** Discord answer message ids, newest last (SESSION-3.a reply lookup). */
  botMessageIds: string[];
  updatedAt: number;
};

type ConversationRow = {
  id: string;
  surface: string;
  thread_key: string;
  user_id: string;
  session_id: string | null;
  summary: string;
  turns: string;
  participants: string;
  bot_message_ids: string;
  updated_at: number;
};

/** Thread key for a Discord conversation: its thread, else its channel. */
export function discordThreadKey(where: { channelId: string; threadId?: string }): string {
  return where.threadId ? `thread:${where.threadId}` : `channel:${where.channelId}`;
}

/** Thread key for a WATCH conversation (one per issue or PR). */
export function watchThreadKey(repo: string, number: number): string {
  return `issue:${repo.toLowerCase()}#${number}`;
}

/** Qualified participant ids (`deleteForPerson` matches on these). */
export function discordParticipant(userId: string): string {
  return `discord:${userId}`;
}

export function githubParticipant(login: string): string {
  return `github:${login.trim().toLowerCase()}`;
}

function parseJsonArray(raw: string): unknown[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function parseTurns(raw: string): ConversationTurn[] {
  const out: ConversationTurn[] = [];
  for (const item of parseJsonArray(raw)) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    if (t.role !== "human" && t.role !== "agent") continue;
    if (typeof t.content !== "string" || !t.content.trim()) continue;
    out.push({
      role: t.role,
      content: t.content,
      createdAt: typeof t.createdAt === "number" ? t.createdAt : 0,
    });
  }
  return out;
}

function parseStrings(raw: string): string[] {
  return parseJsonArray(raw).filter((v): v is string => typeof v === "string" && v.length > 0);
}

function rowToRecord(row: ConversationRow): ConversationRecord {
  return {
    id: row.id,
    surface: row.surface === "watch" ? "watch" : "discord",
    threadKey: row.thread_key,
    userId: row.user_id,
    ...(row.session_id ? { sessionId: row.session_id } : {}),
    summary: row.summary,
    turns: parseTurns(row.turns),
    participants: parseStrings(row.participants),
    botMessageIds: parseStrings(row.bot_message_ids),
    updatedAt: row.updated_at,
  };
}

function newConversationId(): string {
  return `conv_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export type SaveConversationInput = {
  /** Existing record id (update); omitted ⇒ a new record. */
  id?: string;
  surface: ConversationSurface;
  threadKey: string;
  userId: string;
  sessionId?: string;
  summary: string;
  turns: readonly ConversationTurn[];
  participants?: readonly string[];
  botMessageIds?: readonly string[];
};

/**
 * Retained conversations in the shared DB. Every read and write first purges
 * records idle past {@link CONVERSATION_RETENTION_MS}, so nothing older is
 * ever served; the bridge and WATCH also purge on a timer / each poll cycle.
 */
export class ConversationStore {
  private readonly db: Database;
  private readonly now: () => number;
  readonly retentionMs: number;

  constructor(opts: { db: Database; now?: () => number; retentionMs?: number }) {
    this.db = opts.db;
    this.now = opts.now ?? (() => Date.now());
    this.retentionMs = opts.retentionMs ?? CONVERSATION_RETENTION_MS;
  }

  /** Delete records whose last update is older than the retention window. */
  purgeExpired(): number {
    const cutoff = this.now() - this.retentionMs;
    return this.db.run(`DELETE FROM conversation_threads WHERE updated_at < ?`, [cutoff]).changes;
  }

  get(id: string): ConversationRecord | undefined {
    this.purgeExpired();
    const row = this.db
      .query(`SELECT * FROM conversation_threads WHERE id = ?`)
      .get(id) as ConversationRow | null;
    return row ? rowToRecord(row) : undefined;
  }

  /** The record a session carries (its summary while live). */
  forSession(sessionId: string): ConversationRecord | undefined {
    this.purgeExpired();
    const row = this.db
      .query(
        `SELECT * FROM conversation_threads WHERE session_id = ? ORDER BY updated_at DESC LIMIT 1`,
      )
      .get(sessionId) as ConversationRow | null;
    return row ? rowToRecord(row) : undefined;
  }

  /** Newest record for a thread (and person, when given). */
  latestForThread(
    surface: ConversationSurface,
    threadKey: string,
    userId?: string,
  ): ConversationRecord | undefined {
    this.purgeExpired();
    const row = (
      userId === undefined
        ? this.db
            .query(
              `SELECT * FROM conversation_threads WHERE surface = ? AND thread_key = ?
               ORDER BY updated_at DESC LIMIT 1`,
            )
            .get(surface, threadKey)
        : this.db
            .query(
              `SELECT * FROM conversation_threads WHERE surface = ? AND thread_key = ? AND user_id = ?
               ORDER BY updated_at DESC LIMIT 1`,
            )
            .get(surface, threadKey, userId)
    ) as ConversationRow | null;
    return row ? rowToRecord(row) : undefined;
  }

  /** The Discord record one of whose answers is `botMessageId`. */
  byBotMessage(botMessageId: string): ConversationRecord | undefined {
    this.purgeExpired();
    const row = this.db
      .query(
        `SELECT * FROM conversation_threads
         WHERE surface = 'discord'
           AND EXISTS (SELECT 1 FROM json_each(conversation_threads.bot_message_ids) WHERE value = ?)
         ORDER BY updated_at DESC LIMIT 1`,
      )
      .get(botMessageId) as ConversationRow | null;
    return row ? rowToRecord(row) : undefined;
  }

  /**
   * Insert or update a record: text scrubbed (SAFE-6), turns bounded to
   * {@link CONVERSATION_KEEP_TURNS} (the opening human turn kept, the rest
   * folded into the summary), bot message ids to the newest
   * {@link CONVERSATION_KEEP_BOT_MESSAGES}, `updated_at` = now.
   */
  save(input: SaveConversationInput): ConversationRecord {
    this.purgeExpired();
    const scrubbedTurns = input.turns
      .map((t) => ({ ...t, content: clipTurnForRole(t.role, scrubSecrets(t.content)) }))
      .filter((t) => t.content);
    const bounded = boundConversation(
      { summary: scrubSecrets(input.summary), turns: scrubbedTurns },
      CONVERSATION_KEEP_TURNS,
    );
    const record: ConversationRecord = {
      id: input.id ?? newConversationId(),
      surface: input.surface,
      threadKey: input.threadKey,
      userId: input.userId,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      summary: bounded.summary,
      turns: bounded.turns,
      participants: [...new Set(input.participants ?? [])],
      botMessageIds: [...new Set(input.botMessageIds ?? [])].slice(-CONVERSATION_KEEP_BOT_MESSAGES),
      updatedAt: this.now(),
    };
    this.db.run(
      `INSERT INTO conversation_threads
        (id, surface, thread_key, user_id, session_id, summary, turns,
         participants, bot_message_ids, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         surface = excluded.surface,
         thread_key = excluded.thread_key,
         user_id = excluded.user_id,
         session_id = excluded.session_id,
         summary = excluded.summary,
         turns = excluded.turns,
         participants = excluded.participants,
         bot_message_ids = excluded.bot_message_ids,
         updated_at = excluded.updated_at`,
      [
        record.id,
        record.surface,
        record.threadKey,
        record.userId,
        record.sessionId ?? null,
        record.summary,
        JSON.stringify(record.turns),
        JSON.stringify(record.participants),
        JSON.stringify(record.botMessageIds),
        record.updatedAt,
      ],
    );
    return record;
  }

  /** Delete one record (e.g. a live session's thread cleared). */
  delete(id: string): void {
    this.db.run(`DELETE FROM conversation_threads WHERE id = ?`, [id]);
  }

  /**
   * AGENT-6.a / MEMORY-ACL-6 — forget a person's conversations: every record
   * that is theirs (Discord user id, GitHub login) or holds their words (a
   * WATCH thread they commented on). Returns the records deleted.
   */
  deleteForPerson(person: { discordUserIds?: readonly string[]; githubLogins?: readonly string[] }): number {
    const discord = (person.discordUserIds ?? []).map((s) => s.trim()).filter(Boolean);
    const github = (person.githubLogins ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const qualified = [...discord.map(discordParticipant), ...github.map(githubParticipant)];
    if (qualified.length === 0) return 0;
    const marks = (n: number) => Array.from({ length: n }, () => "?").join(", ");
    const clauses: string[] = [];
    const params: string[] = [];
    if (discord.length > 0) {
      clauses.push(`(surface = 'discord' AND user_id IN (${marks(discord.length)}))`);
      params.push(...discord);
    }
    if (github.length > 0) {
      clauses.push(`(surface = 'watch' AND lower(user_id) IN (${marks(github.length)}))`);
      params.push(...github);
    }
    clauses.push(
      `EXISTS (SELECT 1 FROM json_each(conversation_threads.participants) WHERE value IN (${marks(qualified.length)}))`,
    );
    params.push(...qualified);
    return this.db.run(`DELETE FROM conversation_threads WHERE ${clauses.join(" OR ")}`, params).changes;
  }
}

/**
 * MEMORY-ACL-6 — the per-person delete for the forget-me flow: removes every
 * retained conversation of the person (or holding their words) from the
 * shared DB. A running bridge also clears that person's live Discord threads
 * with `SessionStore.forgetConversations`.
 */
export function forgetConversations(
  db: Database,
  person: { discordUserIds?: readonly string[]; githubLogins?: readonly string[] },
): number {
  return new ConversationStore({ db }).deleteForPerson(person);
}

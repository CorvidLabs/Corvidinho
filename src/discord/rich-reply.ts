/**
 * DISCORD-15 / DISCORD-16 (#75) — rich final replies.
 *
 * DISCORD-16: an answer longer than Discord's 2000-character message limit is
 * split into parts of at most 2000 characters. A split never breaks a fenced
 * code block: a part that ends inside one closes it, and the next part
 * reopens it with the same language. The ROLES-CHAT-3 closing note
 * (`(not allowed for your role)`, REQ-agent-333) stays whole in the last
 * part. The text is secret-scrubbed before it is split (SAFE-6), so a cut
 * never leaves half a secret in a shape the scrubber misses. Embeds are used
 * only where they read better than plain text, and never for code: a long
 * answer that is plain prose (no code fence, no user or role mention) and
 * fits one embed goes out as one embed instead of two split messages.
 *
 * DISCORD-15 / DISCORD-15.a: the answer's footer (model, tokens, cost, time)
 * rides the last part. `answerSpendFor` turns the run's provider-reported
 * usage into the tokens and cost the footer shows on the owner's own runs;
 * a cost with no known price (or no usage) stays unknown, never $0 (SAFE-16).
 *
 * Used by the chat reply, the button-pick resume, `/work` and
 * `/session start`; WATCH comments and schedule posts keep their own caps.
 */

import { costMicroUsd, priceForModel } from "../agent/spend.ts";
import { ROLE_REFUSED_SUMMARY_NOTE, clipKeepingRoleNote } from "../agent/task-summary.ts";
import type { AgentTokenUsage } from "../agent/types.ts";
import { scrubSecrets } from "../store/scrub.ts";
import {
  THINKING_COLORS,
  type AnswerSpend,
  type DiscordEmbedPayload,
} from "./thinking-status.ts";

/** Discord's message content limit (characters). */
export const DISCORD_MESSAGE_MAX = 2000;
/** Discord's embed description limit (characters). */
export const DISCORD_EMBED_DESCRIPTION_MAX = 4096;
/**
 * Longest answer body the bridge takes from a run for Discord (three
 * messages' worth). The `result` frame already caps the summary at 4000
 * characters (NDJSON_LIMITS.resultSummary), so this only bounds a body that
 * reaches the bridge some other way.
 */
export const DISCORD_ANSWER_MAX = 3 * DISCORD_MESSAGE_MAX;

const FENCE = "```";
const CLOSE_FENCE = `\n${FENCE}`;
const ROLE_NOTE_TAIL = `\n\n${ROLE_REFUSED_SUMMARY_NOTE}`;

/** How many ``` runs a line holds (each opens or closes a Discord code block). */
function fenceMarks(line: string): number {
  let n = 0;
  for (let i = line.indexOf(FENCE); i >= 0; i = line.indexOf(FENCE, i + FENCE.length)) {
    n += 1;
  }
  return n;
}

/** The ``` line that reopens the block `line` opens: same language, nothing else. */
function reopenFence(line: string): string {
  const after = line.slice(line.lastIndexOf(FENCE) + FENCE.length);
  const lang = /^([A-Za-z0-9_+#.-]{1,32})\s*$/.exec(after)?.[1] ?? "";
  return `${FENCE}${lang}`;
}

/** Where to cut an over-long line: the last space in the back half, else `room` (never inside a surrogate pair). */
function cutPoint(line: string, room: number): number {
  const space = line.lastIndexOf(" ", room - 1);
  if (space >= Math.floor(room / 2)) return space + 1;
  const code = line.charCodeAt(room - 1);
  return code >= 0xd800 && code <= 0xdbff && room > 1 ? room - 1 : room;
}

/**
 * Split `text` into parts of at most `max` characters along line breaks,
 * closing a code fence a part ends inside and reopening it (same language)
 * at the start of the next. A code block that opened partway through a part
 * moves whole to the next part when the part runs out of room; only a block
 * longer than one part is itself split. A line longer than a part is cut at
 * a space when one is near the end, else hard. A fence left open at the end
 * of the text is closed.
 */
function splitBody(text: string, max: number): string[] {
  const parts: string[] = [];
  let lines: string[] = [];
  let len = 0;
  /** Reopen line while inside a code block, else null. */
  let open: string | null = null;
  /** Index in `lines` of the line that opened the current block in this part (-1: none). */
  let fenceAt = -1;
  /** `lines[0]` is a reopened fence, not text from the answer. */
  let reopened = false;

  const add = (line: string) => {
    len += (lines.length ? 1 : 0) + line.length;
    lines.push(line);
  };
  const emit = (ls: string[], close: boolean) => {
    const body = ls.join("\n").replace(/\s+$/, "");
    if (body.trim()) parts.push(close ? `${body}${CLOSE_FENCE}` : body);
  };
  /** Close this part and start the next (reopening the block when inside one). */
  const flush = () => {
    if (!(reopened && lines.length === 1)) emit(lines, open !== null);
    lines = [];
    len = 0;
    fenceAt = -1;
    reopened = false;
    if (open) {
      add(open);
      fenceAt = 0;
      reopened = true;
    }
  };

  for (const source of text.split("\n")) {
    let line = source;
    for (;;) {
      // A part never starts with blank lines outside a code block.
      if (!lines.length && !open && !line.trim()) break;
      const marks = fenceMarks(line);
      const openAfter: string | null = marks % 2 === 1 ? (open ? null : reopenFence(line)) : open;
      const need = (lines.length ? 1 : 0) + line.length + (openAfter ? CLOSE_FENCE.length : 0);
      if (len + need <= max) {
        if (!open && openAfter) fenceAt = lines.length;
        add(line);
        open = openAfter;
        if (!open) fenceAt = -1;
        break;
      }
      if (open && fenceAt > 0) {
        // Carry the block opened partway through this part to the next one.
        const carry = lines.slice(fenceAt);
        emit(lines.slice(0, fenceAt), false);
        lines = [];
        len = 0;
        for (const l of carry) add(l);
        fenceAt = 0;
        reopened = false;
        continue;
      }
      if (lines.length && !(reopened && lines.length === 1)) {
        flush();
        continue;
      }
      // The line does not fit even an empty part: cut it.
      const room = Math.max(1, max - len - (lines.length ? 1 : 0) - CLOSE_FENCE.length);
      const cut = cutPoint(line, room);
      const piece = line.slice(0, cut);
      const pieceMarks = fenceMarks(piece);
      add(piece);
      if (pieceMarks % 2 === 1) open = open ? null : reopenFence(piece);
      flush();
      line = line.slice(cut);
      if (!line) break;
    }
  }
  if (!(reopened && lines.length === 1)) emit(lines, open !== null);
  return parts;
}

/**
 * DISCORD-16 — split an answer at Discord's 2000-character limit without
 * breaking code fences. Text within `max` comes back as is (one part). A
 * closing ROLES-CHAT-3 role note stays whole in the last part. Callers scrub
 * first (SAFE-6); `planAnswerParts` does.
 */
export function splitDiscordMessage(text: string, max = DISCORD_MESSAGE_MAX): string[] {
  if (text.length <= max) return [text];
  const note = text.endsWith(ROLE_NOTE_TAIL) ? ROLE_NOTE_TAIL : "";
  const head = note ? text.slice(0, text.length - note.length) : text;
  const parts = splitBody(head, max);
  if (note) {
    const i = parts.length - 1;
    if (i >= 0 && parts[i]!.length + note.length <= max) parts[i] = `${parts[i]}${note}`;
    else parts.push(note.trim());
  }
  return parts;
}

/**
 * DISCORD-16 — whether a long answer reads better as one embed than as split
 * messages: plain prose over one message that fits one embed, with no code
 * fence (never code in an embed) and no user or role mention (a mention in an
 * embed does not notify).
 */
export function readsBetterAsEmbed(text: string): boolean {
  return (
    text.length > DISCORD_MESSAGE_MAX &&
    text.length <= DISCORD_EMBED_DESCRIPTION_MAX &&
    !text.includes(FENCE) &&
    !/<@[!&]?\d+>/.test(text)
  );
}

/** One Discord message of an answer: text and/or an embed. */
export type AnswerPart = {
  content: string | null;
  embed: DiscordEmbedPayload | null;
};

/**
 * DISCORD-15/16 — the messages an answer goes out as. The text is scrubbed
 * first (SAFE-6). Within 2000 characters: one plain message with the footer
 * embed (as before). Longer plain prose (`allowEmbed`, see
 * `readsBetterAsEmbed`): one embed holding the text and the footer. Anything
 * else: `splitDiscordMessage` parts, the footer embed on the last one. A text
 * over DISCORD_ANSWER_MAX is cut to it (ending in `…`, a closing role note
 * kept) after the scrub, so no path posts more than that.
 */
export function planAnswerParts(
  text: string,
  opts: { footer: DiscordEmbedPayload | null; allowEmbed?: boolean },
): AnswerPart[] {
  const clean = clipKeepingRoleNote(
    scrubSecrets(text),
    DISCORD_ANSWER_MAX,
    (head, n) => `${head.slice(0, Math.max(0, n - 1))}…`,
  );
  if (clean.length <= DISCORD_MESSAGE_MAX) return [{ content: clean, embed: opts.footer }];
  if (opts.allowEmbed && readsBetterAsEmbed(clean)) {
    return [
      {
        content: null,
        embed: {
          description: clean,
          color: opts.footer?.color ?? THINKING_COLORS.success,
          ...(opts.footer?.footer ? { footer: opts.footer.footer } : {}),
        },
      },
    ];
  }
  const parts = splitDiscordMessage(clean);
  return parts.map((content, i) => ({
    content,
    embed: i === parts.length - 1 ? opts.footer : null,
  }));
}

/** Users of `ids` whose mention appears in `text` and who were not pinged yet. */
function mentionsIn(text: string | null, ids: readonly string[], pinged: Set<string>): string[] {
  if (!text) return [];
  const out = ids.filter(
    (id) => !pinged.has(id) && (text.includes(`<@${id}>`) || text.includes(`<@!${id}>`)),
  );
  for (const id of out) pinged.add(id);
  return out;
}

/** A fresh channel post that may carry an embed (the bridge gateway reply). */
export type AnswerPost = (p: {
  channelId: string;
  content: string;
  embed?: DiscordEmbedPayload;
  replyToMessageId?: string;
  mentionUserIds?: string[];
  components?: unknown[];
}) => Promise<{ messageId: string } | null>;

/**
 * Post an answer as fresh messages (the reply paths that cannot edit the
 * thinking message). The first part replies to `replyToMessageId` with the
 * answer's allowed mentions, as a single reply did; each later part allows
 * only the users of `mentionUserIds` first mentioned in it (none by default,
 * so model text never pings), so a mention that landed past the first part
 * still pings. `components` ride the last part. Returns the posted message ids in
 * order, or null when the first part did not go out.
 */
export async function postAnswerParts(
  post: AnswerPost,
  opts: {
    channelId: string;
    content: string;
    footer: DiscordEmbedPayload | null;
    replyToMessageId?: string;
    mentionUserIds?: string[];
    components?: unknown[];
    /** Post parts after the first only (the first went out another way). */
    skipFirst?: boolean;
  },
): Promise<string[] | null> {
  const hasComponents = Boolean(opts.components?.length);
  const parts = planAnswerParts(opts.content, {
    footer: hasComponents ? null : opts.footer,
    allowEmbed: !hasComponents && !opts.mentionUserIds?.length,
  });
  const ids: string[] = [];
  const pinged = new Set<string>();
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    // A user counts as pinged only by the part that holds their mention: one
    // that lands in a later part (e.g. the SAFE-8 owner line appended at the
    // end of a long answer) is pinged by that part, once.
    const firstMentioned = mentionsIn(part.content, opts.mentionUserIds ?? [], pinged);
    if (i === 0 && opts.skipFirst) continue;
    const last = i === parts.length - 1;
    const mentions = i === 0 ? opts.mentionUserIds : firstMentioned;
    const sent = await post({
      channelId: opts.channelId,
      content: part.content ?? "",
      ...(part.embed ? { embed: part.embed } : {}),
      ...(i === 0 && opts.replyToMessageId ? { replyToMessageId: opts.replyToMessageId } : {}),
      ...(mentions ? { mentionUserIds: mentions } : {}),
      ...(last && hasComponents ? { components: opts.components } : {}),
    });
    if (!sent) {
      if (ids.length === 0 && !opts.skipFirst) return null;
      break;
    }
    ids.push(sent.messageId);
  }
  return ids;
}

/**
 * DISCORD-15 / SAFE-16 — tokens and cost for an answer footer from the run's
 * provider-reported usage and the model's known price. Tokens are unknown
 * without usage; the cost is unknown without usage or without a known price
 * for `model` (MODEL_PRICES_USD_PER_MTOK, exact id) — never counted as $0.
 * Only the owner's own runs show these (DISCORD-15.a, SAFE-14.a): callers pass
 * the result to the footer for those runs only.
 */
export function answerSpendFor(
  usage: AgentTokenUsage | undefined,
  model: string | undefined,
): AnswerSpend {
  if (!usage) return {};
  const tokens = Math.max(usage.totalTokens, usage.promptTokens + usage.completionTokens);
  if (!(tokens > 0)) return {};
  const price = model?.trim() ? priceForModel(model) : null;
  const cost = price ? costMicroUsd(price, usage) : 0;
  return cost > 0 ? { totalTokens: tokens, costMicroUsd: cost } : { totalTokens: tokens };
}

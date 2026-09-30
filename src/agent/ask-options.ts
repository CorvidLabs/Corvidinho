/**
 * DISCORD-ASK-1 — extract a short list of choices from ask-human structured
 * options or from numbered / lettered lines in the question text. Labels
 * are secret-scrubbed before they are cut (SAFE-6.a, `cleanAskLabel`).
 * Pure; no I/O.
 */

import type { AskOption } from "../agent/types.ts";
import { scrubSecrets } from "../store/scrub.ts";

/** Discord allows ≤5 buttons per ActionRow; we use one row. */
export const ASK_OPTIONS_MAX = 5;

/** Button label hard limit (Discord). */
export const ASK_OPTION_LABEL_MAX = 80;

/** Numbered / lettered choice lines: "1. foo", "1) foo", "a) foo", "- foo" (2+). */
const CHOICE_LINE_RE =
  /^\s*(?:(?:\d+)[.)]\s+|[a-dA-D][.)]\s+|[-*]\s+)(.+?)\s*$/;

/**
 * One choice label as it is posted on its button and stored with the open
 * ask: whitespace collapsed, SAFE-6 scrubbed, then cut at
 * ASK_OPTION_LABEL_MAX. The scrub runs before the cut (SAFE-6.a), so a label
 * that held a secret shows `[redacted:<kind>]` and a secret the cut would
 * split never survives as a raw piece too short for its scrub pattern.
 * Empty ⇒ "".
 */
export function cleanAskLabel(raw: string): string {
  const t = scrubSecrets(raw.replace(/\s+/g, " ").trim());
  if (!t) return "";
  return t.length <= ASK_OPTION_LABEL_MAX
    ? t
    : `${t.slice(0, ASK_OPTION_LABEL_MAX - 1)}…`;
}

function toOption(id: string, label: string): AskOption | null {
  const cleaned = cleanAskLabel(label);
  if (!cleaned) return null;
  return { id, label: cleaned };
}

/**
 * Claim `id` for one option of an ask, or, when an earlier option already
 * holds it, the first unused position number ("1", "2", …). Each id rides in
 * its button's custom_id (`cvask:pick:<askId>:<id>`), which Discord requires
 * to be unique, and a pick is matched to its label by id (DISCORD-ASK-1/3).
 */
function claimOptionId(id: string, used: Set<string>): string {
  let unique = id;
  for (let n = 1; used.has(unique); n++) unique = String(n);
  used.add(unique);
  return unique;
}

/**
 * Normalize structured options from the ask-human tool (array of strings or
 * `{id,label}` objects). Caps at ASK_OPTIONS_MAX; drops empties. Ids come out
 * unique: a repeated id (explicit, cut to 32 chars, or a position fallback)
 * takes the first unused position number. Options whose ids are already
 * unique come out unchanged, so normalizing a stored ask again is a no-op.
 */
export function normalizeAskOptions(raw: unknown): AskOption[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: AskOption[] = [];
  const used = new Set<string>();
  const add = (o: AskOption | null) => {
    if (o) out.push({ id: claimOptionId(o.id, used), label: o.label });
  };
  for (let i = 0; i < raw.length && out.length < ASK_OPTIONS_MAX; i++) {
    const item = raw[i];
    if (typeof item === "string") {
      add(toOption(String(i + 1), item));
      continue;
    }
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const rec = item as Record<string, unknown>;
      const label =
        typeof rec.label === "string"
          ? rec.label
          : typeof rec.text === "string"
            ? rec.text
            : typeof rec.value === "string"
              ? rec.value
              : "";
      const idRaw =
        typeof rec.id === "string" && rec.id.trim()
          ? rec.id.trim().slice(0, 32)
          : String(i + 1);
      const cleanId = idRaw.replace(/[^a-zA-Z0-9_-]/g, "");
      // The id rides in the button custom_id and is stored with the open ask
      // (discord_sessions.pending_ask), where it must stay byte-identical for
      // the button to work after a restart. So one that looks like a secret
      // falls back to its position instead of being redacted at rest (SAFE-6).
      const id = cleanId && scrubSecrets(cleanId) === cleanId ? cleanId : String(i + 1);
      add(toOption(id, label));
    }
  }
  return out.length >= 2 ? out : undefined;
}

/**
 * Parse numbered/lettered choice lines from a question. Needs ≥2 choices.
 * Does not invent options when the text is free-form.
 */
export function parseChoicesFromQuestion(question: string): AskOption[] | undefined {
  const lines = question.split(/\r?\n/);
  const found: AskOption[] = [];
  for (const line of lines) {
    const m = CHOICE_LINE_RE.exec(line);
    if (!m) continue;
    const o = toOption(String(found.length + 1), m[1] ?? "");
    if (o) found.push(o);
    if (found.length >= ASK_OPTIONS_MAX) break;
  }
  return found.length >= 2 ? found : undefined;
}

/**
 * Resolve options for an ask: structured first, else parse the question.
 */
export function resolveAskOptions(opts: {
  options?: AskOption[] | unknown;
  question: string;
}): AskOption[] | undefined {
  const structured = normalizeAskOptions(opts.options);
  if (structured) return structured;
  return parseChoicesFromQuestion(opts.question);
}

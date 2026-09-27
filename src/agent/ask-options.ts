/**
 * DISCORD-ASK-1 — extract a short list of choices from ask-human structured
 * options or from numbered / lettered lines in the question text.
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

function cleanLabel(raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length <= ASK_OPTION_LABEL_MAX
    ? t
    : `${t.slice(0, ASK_OPTION_LABEL_MAX - 1)}…`;
}

function toOption(id: string, label: string): AskOption | null {
  const cleaned = cleanLabel(label);
  if (!cleaned) return null;
  return { id, label: cleaned };
}

/**
 * Normalize structured options from the ask-human tool (array of strings or
 * `{id,label}` objects). Caps at ASK_OPTIONS_MAX; drops empties.
 */
export function normalizeAskOptions(raw: unknown): AskOption[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: AskOption[] = [];
  for (let i = 0; i < raw.length && out.length < ASK_OPTIONS_MAX; i++) {
    const item = raw[i];
    if (typeof item === "string") {
      const o = toOption(String(i + 1), item);
      if (o) out.push(o);
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
      const o = toOption(id, label);
      if (o) out.push(o);
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

/**
 * Parse `task run --json` stdout into a short caller-friendly summary
 * (Discord HEAR / WATCH poll). Falls back to truncated stdout/stderr.
 * `summarizeTaskResult` also summarizes the NDJSON `result` frame (#73).
 *
 * DISCORD-3.a — Discord/chat outbound uses `chatBodyFromTaskResult` (human
 * text only). Plumbing (`state=… verified=…`) belongs on the thinking embed,
 * via `formatTaskPlumbing`, never in the final chat reply body.
 *
 * REQ-agent-232 / SAFE-6 — the summary, non-frame stdout and stderr are
 * secret-scrubbed before they are clipped, so a clip never cuts a secret into
 * a shape the scrubber misses (a short `ghp_` prefix, a key without its END).
 */

import { ROLE_REFUSED_MESSAGE } from "../plugins/roles.ts";
import { scrubSecrets } from "../store/scrub.ts";
import { MODEL_FALLBACK_NOTE_PREFIX } from "./providers.ts";

/**
 * ROLES-CHAT-3 (REQ-agent-333): the short in-session note a run's summary
 * ends with once a tool call was refused for the caller's role.
 */
export const ROLE_REFUSED_SUMMARY_NOTE = `(${ROLE_REFUSED_MESSAGE})`;

const ROLE_NOTE_TAIL = `\n\n${ROLE_REFUSED_SUMMARY_NOTE}`;

/**
 * AGENT-11: a closing `(model fallback: …)` paragraph (one line) at the end
 * of `text` (providers `modelFallbackNote`).
 */
const FALLBACK_NOTE_TAIL_RE = new RegExp(
  `\\n\\n${MODEL_FALLBACK_NOTE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\n]*\\)$`,
);

/**
 * The closing notes `text` ends with, as they stand (each after a blank
 * line): the model fallback note (AGENT-11), then the role note
 * (REQ-agent-333), either or both; "" when none.
 */
export function closingNotesTail(text: string): string {
  let rest = text;
  let tail = "";
  if (rest.endsWith(ROLE_NOTE_TAIL)) {
    tail = ROLE_NOTE_TAIL;
    rest = rest.slice(0, rest.length - ROLE_NOTE_TAIL.length);
  }
  const fallback = FALLBACK_NOTE_TAIL_RE.exec(rest);
  return fallback ? `${fallback[0]}${tail}` : tail;
}

/**
 * Clip already-scrubbed `text` longer than `max` with `clip`, keeping its
 * closing notes (`closingNotesTail`: the model fallback note, AGENT-11, and
 * the role note, REQ-agent-333): a long reply loses the end of its body,
 * never a note. Text within `max` is returned as is.
 */
export function clipKeepingRoleNote(
  text: string,
  max: number,
  clip: (head: string, max: number) => string,
): string {
  if (text.length <= max) return text;
  const tail = closingNotesTail(text);
  if (!tail) return clip(text, max);
  const head = text.slice(0, text.length - tail.length);
  return `${clip(head, Math.max(0, max - tail.length)).trimEnd()}${tail}`;
}

/** Scrub, trim, then clip (SAFE-6: scrub before the clip). */
function scrubClip(text: string, max: number): string {
  return scrubSecrets(text).trim().slice(0, max);
}

/**
 * AGENT-9 / DISCORD-3.a defense in depth: drop internal tool-round stop lines
 * from outbound chat bodies even if an older execute path left them in summary.
 */
export function stripInternalStopReason(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^Stopped after \d+ tool rounds\b/i.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Fields of a TaskResult used for the summary (all optional when parsed). */
export type TaskResultSummaryInput = {
  summary?: string;
  state?: string;
  verified?: boolean;
  verifySkipped?: boolean;
  attempts?: number;
  cancelled?: boolean;
};

/**
 * Operator plumbing line for thinking/progress embeds (DISCORD-3.a).
 * Example: `state=done verified=false verifySkipped attempts=1`
 */
export function formatTaskPlumbing(r: TaskResultSummaryInput): string {
  const bits: string[] = [];
  if (r.state) bits.push(`state=${r.state}`);
  if (typeof r.verified === "boolean") bits.push(`verified=${r.verified}`);
  if (r.verifySkipped) bits.push("verifySkipped");
  if (r.cancelled) bits.push("cancelled");
  if (typeof r.attempts === "number") bits.push(`attempts=${r.attempts}`);
  return bits.join(" ");
}

/** Default chat body cap (WATCH comments, delegate / schedule callers). */
export const CHAT_BODY_MAX = 1800;

/**
 * Human chat body only — no `state=` / `verified=` plumbing (DISCORD-3.a).
 * Caps at `max` chars (default 1800, CHAT_BODY_MAX); the cap keeps a closing
 * role note (ROLES-CHAT-3, REQ-agent-333). The Discord bridge passes a larger
 * `max` and splits the body into messages itself (DISCORD-16).
 */
export function chatBodyFromTaskResult(
  r: TaskResultSummaryInput,
  max: number = CHAT_BODY_MAX,
): string {
  if (typeof r.summary !== "string") return "";
  const text = scrubSecrets(stripInternalStopReason(r.summary)).trim();
  return clipKeepingRoleNote(text, max, (head, n) => head.slice(0, n));
}

/**
 * Legacy combined form (CLI / WATCH logs): plumbing line + body.
 * Prefer `chatBodyFromTaskResult` + `formatTaskPlumbing` for Discord UX.
 */
export function summarizeTaskResult(r: TaskResultSummaryInput): string {
  const head = formatTaskPlumbing(r);
  const body = chatBodyFromTaskResult(r);
  const text = body ? (head ? `${head}\n${body}` : body) : head;
  return text.slice(0, 1800);
}

export function summarizeTaskRunOutput(
  stdout: string,
  stderr: string,
  exitCode: number,
): string {
  const trimmed = stdout.trim();
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed) as {
        result?: TaskResultSummaryInput;
      };
      const r = parsed?.result;
      if (r && typeof r === "object") {
        return summarizeTaskResult(r) || scrubClip(trimmed, 1800);
      }
    } catch {
      /* fall through to raw */
    }
  }
  return (
    scrubClip(trimmed, 1800) ||
    scrubClip(stderr, 500) ||
    `(exit ${exitCode})`
  );
}

/** Chat-only parse of `task run --json` / result frame for Discord replies. */
export function chatBodyFromTaskRunOutput(
  stdout: string,
  stderr: string,
  exitCode: number,
): string {
  const trimmed = stdout.trim();
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed) as {
        result?: TaskResultSummaryInput;
      };
      const r = parsed?.result;
      if (r && typeof r === "object") {
        const body = chatBodyFromTaskResult(r);
        if (body) return body;
      }
    } catch {
      /* fall through */
    }
  }
  // No structured result — avoid leaking raw JSON plumbing; prefer stderr/exit.
  if (trimmed.startsWith("{") && trimmed.includes('"result"')) {
    return (
      scrubClip(stderr, 500) ||
      `(exit ${exitCode})`
    );
  }
  return (
    scrubClip(trimmed, 1800) ||
    scrubClip(stderr, 500) ||
    `(exit ${exitCode})`
  );
}

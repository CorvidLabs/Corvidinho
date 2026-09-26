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

import { scrubSecrets } from "../store/scrub.ts";

/** Scrub, trim, then clip (SAFE-6: scrub before the clip). */
function scrubClip(text: string, max: number): string {
  return scrubSecrets(text).trim().slice(0, max);
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

/**
 * Human chat body only — no `state=` / `verified=` plumbing (DISCORD-3.a).
 * Caps at 1800 chars for Discord outbound.
 */
export function chatBodyFromTaskResult(r: TaskResultSummaryInput): string {
  return typeof r.summary === "string" ? scrubClip(r.summary, 1800) : "";
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

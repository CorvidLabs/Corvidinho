/**
 * DISCORD-3.b (#122) — when a run fails, the owner's own runs say why in one
 * plain line; everyone else gets "That didn't work — the owner has been
 * told.", and the reason is always logged.
 *
 * One helper for every surface that posts a failed run's answer (chat, an ask
 * pick or Answer form resuming a talk, `/session start`, `/work`, a schedule's
 * result post), replacing the old `session <id> failed (exit N)` line that
 * dropped the reason:
 *
 *  - The reason (`failureReasonFor`) comes from harness text only (SAFE-12/13,
 *    AGENT-9): the result frame's `error` (the no-provider notice, which model
 *    call failed and how, or which verify failed — `task run` sets it), else
 *    the run tier's no-provider notice (AGENT-10), else the last meaningful
 *    line of the child's stderr, else the exit code. Never the run's summary
 *    (model text) or a tool's output.
 *  - It is secret-scrubbed first (SAFE-6), then ANSI codes, stack frames,
 *    source excerpts and runtime banners are dropped, host paths are cut to
 *    their last segment, mass mentions are defanged, and it is cut to one
 *    line of at most {@link FAILURE_REASON_MAX} characters.
 *  - Every failure logs one line: `[discord] run failed (<surface>, exit N):
 *    <reason>` (the scheduler logs with its own prefix).
 *  - The owner's own run (the DISCORD-15.a owner check): the reply body is
 *    the reason. Anyone else: {@link FAILED_TOLD_OWNER_TEXT}, and it is true —
 *    the owner is DMed the reason with the surface and channel through the
 *    bridge's gateway DM (the spend-DM path), one DM per reason per
 *    {@link FAILURE_DM_DEDUP_MS}. With no owner, no DM path or a DM that did
 *    not go out, the reply is only {@link FAILED_TEXT}: it never claims the
 *    owner was told. No spend amounts ride any of it (SAFE-14.a).
 *
 * The embed footer's `state= verified= attempts=` plumbing is unchanged and
 * never in the body (DISCORD-3.a).
 */

import { providerNotice } from "../agent/providers.ts";
import { loadTierFromEnv } from "../agent/tier.ts";
import type { OwnerRecord } from "../identity/owner.ts";
import { scrubSecrets } from "../store/scrub.ts";
import { defangMassMentions } from "./allowed-mentions.ts";
import type { SendPrivateDm } from "./private-reply.ts";

/** A non-owner's failed-run reply once the owner has been told (DMed). */
export const FAILED_TOLD_OWNER_TEXT = "That didn't work — the owner has been told.";

/** A non-owner's failed-run reply when the owner could not be told. */
export const FAILED_TEXT = "That didn't work.";

/** Longest reason line (after the scrub and the one-line cut). */
export const FAILURE_REASON_MAX = 200;

/** The same reason DMs the owner once in this window. */
export const FAILURE_DM_DEDUP_MS = 60 * 60 * 1000;

/** Longest `error` read from a result frame (before the one-line cut). */
const FAILURE_REASON_IN_MAX = 2000;

/** The surface a failed run was started from (names it in the log and the DM). */
export type FailureSurface = "chat" | "ask" | "session" | "work" | "schedule";

/** What of a finished (or thrown) run the reason is read from. */
export type FailedRunFacts = {
  /** Undefined for a run that threw before it exited. */
  exitCode?: number;
  /** The result frame's `error`, or a thrown error's message. */
  failureReason?: string;
  /** The end of the child's stderr. */
  stderrTail?: string;
  task?: { cancelled?: boolean };
};

/** A result frame's `error`, when it is a non-empty string (scrubbed, capped). */
export function failureReasonFromUnknown(v: unknown): string | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  // Scrub before the cap, so the cap never cuts a secret into a shape the
  // scrub misses (SAFE-6).
  return scrubSecrets(v.trim()).slice(0, FAILURE_REASON_IN_MAX);
}

const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
/** `    at fn (/path/x.ts:1:2)` — a stack frame. */
const STACK_FRAME_RE = /^\s*at\s+\S/;
/** Bun's source excerpt (`12 | code`) and its caret line. */
const SOURCE_EXCERPT_RE = /^\s*\d+\s*\|/;
const CARET_RE = /^\s*[\^~]+\s*$/;
/** `Bun v1.2.3 (Linux x64)` / `Node.js v22…` banners. */
const RUNTIME_BANNER_RE = /^\s*(Bun|Node\.js)\s+v\d/;
/** A line that reads like the failure itself. */
const ERRORISH_RE =
  /\b(error|errors|failed|fail|failure|refused|denied|not set|not found|timed out|unauthorized|forbidden|exception|panic|cannot|can't|could not|unable)\b/i;
/**
 * An absolute or relative host path (`/home/…`, `./x/y`, `~/…`, `file:///…`)
 * after a start, space, quote or bracket; never the `//host/…` of a URL.
 */
const HOST_PATH_RE = /(^|[\s'"`(=[<,])((?:file:\/\/)?(?:~|\.{1,2})?\/[^\s'"`)\]>,;]+)/g;

function lastSegment(path: string): string {
  const parts = path.replace(/^file:\/\//, "").split("/").filter(Boolean);
  return parts.at(-1) ?? "";
}

/** Host paths cut to `…/<last segment>` (the machine's layout stays private). */
function stripHostPaths(line: string): string {
  return line.replace(HOST_PATH_RE, (_m, lead: string, path: string) => {
    const tail = lastSegment(path);
    return `${lead}…${tail ? `/${tail}` : ""}`;
  });
}

function meaningful(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (STACK_FRAME_RE.test(t) || SOURCE_EXCERPT_RE.test(t) || CARET_RE.test(t)) return false;
  if (RUNTIME_BANNER_RE.test(t)) return false;
  // Punctuation-only lines (separators, braces) say nothing.
  return /[\p{L}\p{N}]/u.test(t);
}

/** A sentence-end cut keeps at least this much. */
const SENTENCE_CUT_MIN = 40;

/** Cut to `max` at a sentence end, else a word end, else hard (with `…`). */
function cutLine(line: string, max: number): string {
  if (line.length <= max) return line;
  const head = line.slice(0, max);
  const sentence = Math.max(head.lastIndexOf(". "), head.endsWith(".") ? max - 1 : -1);
  if (sentence >= SENTENCE_CUT_MIN) return head.slice(0, sentence + 1);
  let cut = head.lastIndexOf(" ", max - 1);
  if (cut < Math.floor(max / 2)) cut = max - 1;
  // Never end on half a surrogate pair.
  const code = line.charCodeAt(cut - 1);
  if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
  return `${line.slice(0, cut).trimEnd()}…`;
}

/**
 * Raw failure text (a result frame's `error`, a thrown message, a stderr end)
 * as one plain line: secret-scrubbed first (SAFE-6), ANSI codes, stack
 * frames, source excerpts and runtime banners dropped, the last line that
 * reads like an error kept (else the last meaningful line), host paths cut
 * to their last segment, whitespace collapsed, mass mentions defanged, then
 * cut to `max`. "" when nothing meaningful is left.
 */
export function plainFailureLine(raw: string, max: number = FAILURE_REASON_MAX): string {
  const scrubbed = scrubSecrets(raw).replace(ANSI_RE, "");
  const lines = scrubbed.split(/\r?\n/).filter(meaningful);
  if (lines.length === 0) return "";
  const picked = [...lines].reverse().find((l) => ERRORISH_RE.test(l)) ?? lines.at(-1)!;
  const line = defangMassMentions(stripHostPaths(picked).replace(/\s+/g, " ").trim());
  return cutLine(line, max);
}

/**
 * Why a run failed, as one plain line of harness text (see the module doc for
 * the order). Never the run's summary.
 */
export function failureReasonFor(
  run: FailedRunFacts,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const fromResult = run.failureReason ? plainFailureLine(run.failureReason) : "";
  if (fromResult) return fromResult;
  // AGENT-10: the notice a bridge-spawned run at the configured tier fails with.
  const notice = providerNotice(env, [loadTierFromEnv(env, "tool")]);
  if (notice) return plainFailureLine(notice);
  const fromStderr = run.stderrTail ? plainFailureLine(run.stderrTail) : "";
  if (fromStderr) return fromStderr;
  if (run.task?.cancelled || run.exitCode === 130) {
    return "The run was interrupted before it finished";
  }
  return run.exitCode === undefined
    ? "The run failed without saying why"
    : `The run failed (exit ${run.exitCode}) without saying why`;
}

/** The log line every failed run writes (the reason is already scrubbed). */
export function formatFailureLog(
  prefix: string,
  surface: string,
  exitCode: number | undefined,
  reason: string,
): string {
  const exit = exitCode === undefined ? "" : `, exit ${exitCode}`;
  return `${prefix} run failed (${surface}${exit}): ${reason}`;
}

/** What the owner is told about someone else's failed run. */
export type FailureNotice = {
  reason: string;
  /** Where it ran: the surface (and a schedule's id). */
  surface: string;
  /** The channel it ran in, named in the DM. */
  channelId?: string;
};

/** The owner's DM about a failed run (the reason is already scrubbed). */
export function formatFailureDm(n: FailureNotice): string {
  const channel = n.channelId?.trim();
  const where = channel ? ` in <#${channel}>` : "";
  return `❌ A run failed (${n.surface}${where}): ${n.reason}`;
}

export type FailureOwnerDm = {
  /**
   * DM the owner this failure's reason, unless the same reason already
   * reached them within {@link FAILURE_DM_DEDUP_MS}. True when the owner has
   * been told (now, or by that earlier DM); false with no owner, no DM path
   * or a DM that did not go out. Never rejects.
   */
  tell(n: FailureNotice): Promise<boolean>;
};

export type FailureOwnerDmDeps = {
  /** The configured owner, read now (IDENTITY-1). */
  owner: () => OwnerRecord | null | undefined;
  /** The gateway's DM send, read now (unset until the gateway is up). */
  sendDm: () => SendPrivateDm | undefined;
  now?: () => number;
  windowMs?: number;
};

export function createFailureOwnerDm(deps: FailureOwnerDmDeps): FailureOwnerDm {
  const now = deps.now ?? Date.now;
  const windowMs = deps.windowMs ?? FAILURE_DM_DEDUP_MS;
  // reason → the DM that carried it (in flight or sent) and when.
  const told = new Map<string, { at: number; sent: Promise<boolean> }>();
  const send = async (fn: SendPrivateDm, userId: string, content: string): Promise<boolean> => {
    try {
      return (await fn({ userId, content })) !== null;
    } catch {
      return false;
    }
  };
  return {
    async tell(n) {
      const userId = deps.owner()?.discordId?.trim();
      const fn = deps.sendDm();
      if (!userId || !fn) return false;
      const t = now();
      for (const [k, v] of told) if (t - v.at >= windowMs) told.delete(k);
      const prior = told.get(n.reason);
      if (prior && (await prior.sent)) return true;
      const entry = { at: t, sent: send(fn, userId, formatFailureDm(n)) };
      told.set(n.reason, entry);
      const ok = await entry.sent;
      // A DM that did not go out is not remembered: the next failure retries.
      if (!ok && told.get(n.reason) === entry) told.delete(n.reason);
      return ok;
    },
  };
}

export type FailedRunReplyOpts = {
  run: FailedRunFacts;
  /** The owner's own run (the DISCORD-15.a owner check; a schedule the owner created). */
  ownerRun: boolean;
  /** Named in the log and the owner's DM (`schedule <id>` for a schedule). */
  surface: FailureSurface | `schedule ${string}`;
  channelId?: string;
  /** The owner's DM; absent (the daemon) ⇒ nobody is told. */
  ownerDm?: FailureOwnerDm;
  env?: NodeJS.ProcessEnv;
  log?: (line: string) => void;
  /** Default `[discord]`. */
  logPrefix?: string;
};

/**
 * A failed run's outcome (DISCORD-3.b): `reason` (always logged first) and
 * the reply `body` — the reason for the owner's own run; for anyone else
 * {@link FAILED_TOLD_OWNER_TEXT} once the owner has the reason by DM, else
 * {@link FAILED_TEXT}. Never rejects.
 */
export async function failedRunOutcome(
  o: FailedRunReplyOpts,
): Promise<{ body: string; reason: string }> {
  const reason = failureReasonFor(o.run, o.env);
  (o.log ?? ((line: string) => console.warn(line)))(
    formatFailureLog(o.logPrefix ?? "[discord]", o.surface, o.run.exitCode, reason),
  );
  if (o.ownerRun) return { body: reason, reason };
  let told = false;
  try {
    told = (await o.ownerDm?.tell({ reason, surface: o.surface, channelId: o.channelId })) === true;
  } catch {
    told = false;
  }
  return { body: told ? FAILED_TOLD_OWNER_TEXT : FAILED_TEXT, reason };
}

/** The reply body of a failed run ({@link failedRunOutcome}'s `body`). */
export async function failedRunReply(o: FailedRunReplyOpts): Promise<string> {
  return (await failedRunOutcome(o)).body;
}

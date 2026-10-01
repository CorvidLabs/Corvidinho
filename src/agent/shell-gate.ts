/**
 * SAFE-3.a (#83, #124): who is offered the shell, the language runners and
 * the Fledge core runs ({@link SAFE3A_TOOLS}).
 *
 * The model gets them only in the owner's own interactive runs (chat,
 * `/session start`, `/work`, the local CLI), only when the run's allowlist
 * names them (SAFE-1 / CLI-3; the tier still filters, so they need code tier),
 * and only inside that talk's own worktree. Non-owners, WATCH and schedules
 * never get them. {@link shellToolsGate} decides this for one execute attempt
 * and re-reads everything on each attempt:
 *
 * - a delegate or council worker (delegation depth > 0) never gets them;
 * - a WATCH run (`CORVIDINHO_WATCH_SESSION_ID`) or a scheduled run
 *   (`isScheduleRunEnv`) is refused whatever its stamp says;
 * - a run with no role session is the local CLI (REQ-cli-681): it gets them
 *   only when nothing spawned it (no Discord session id, no surface stamp)
 *   and its cwd is the top of the linked worktree `task run` made for this
 *   run (`talkWorktree`, SESSION-WORKTREE-1.a / REQ-cli-122), which only
 *   `taskRun` passes, in-process, never from the env; `--here`, a non-git
 *   folder and a subdirectory are refused. The local operator is the owner
 *   (no role session to check);
 * - otherwise (a role session) the surface stamp ({@link ACTING_SURFACE_ENV},
 *   always overwritten by the spawning client) must be `chat`, `ask`,
 *   `session` or `work` ({@link SAFE3A_SURFACES}); `watch`, `schedule`, an
 *   unknown value and no stamp are refused;
 * - the acting role, re-resolved now in the tool layer the way `runPlugin`
 *   resolves it (IDENTITY-12: owner match, bridge bit, not muted or
 *   deny-listed), must be the owner;
 * - the cwd must be the top of the linked talk worktree made for this run's
 *   session (`talkWorktreeId(CORVIDINHO_DISCORD_SESSION_ID)`, a git admin dir
 *   under `worktrees/talk-*`): the main checkout, another talk's worktree, a
 *   subdirectory, a non-git scoped dir and a non-git project folder are
 *   refused.
 *
 * The gate only decides the catalog. Every call still goes through
 * `runPlugin` (role re-check, SAFE-1, the must-ask gate, SAFE-5 audit) and the
 * tools' own SAFE-3 clamp, SAFE-21 foot-guns and credential-free env.
 */

import { readFileSync, realpathSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { delegateDepthFromEnv } from "../autonomous/delegate.ts";
import { isScheduleRunEnv, resolveActingRole, roleSessionActive } from "../plugins/roles.ts";
import { talkWorktreeGitDir } from "../worktree/base.ts";
import { talkWorktreeId } from "../worktree/manager.ts";

/**
 * Env key the spawning client sets to the surface a run was started from. It
 * is internal: the client always overwrites it, never passes on an inherited
 * value, and delegate workers and the verify lane drop it with the other
 * `CORVIDINHO_ACTING_*` keys.
 */
export const ACTING_SURFACE_ENV = "CORVIDINHO_ACTING_SURFACE";

/**
 * Where a run was started: a Discord chat message (`chat`), an ask-button
 * pick or Answer form continuing a talk (`ask`), `/session start`
 * (`session`), `/work` (`work`), a WATCH event (`watch`) or a schedule tick
 * (`schedule`).
 */
export const ACTING_SURFACES = ["chat", "ask", "session", "work", "watch", "schedule"] as const;

export type ActingSurface = (typeof ACTING_SURFACES)[number];

/** The surfaces SAFE-3.a allows: the owner's own interactive Discord runs. */
export const SAFE3A_SURFACES: ReadonlySet<ActingSurface> = new Set<ActingSurface>([
  "chat",
  "ask",
  "session",
  "work",
]);

/** The run's surface stamp; null when unset, empty or unknown. */
export function actingSurface(env: NodeJS.ProcessEnv = process.env): ActingSurface | null {
  const raw = (env[ACTING_SURFACE_ENV] ?? "").trim().toLowerCase();
  return (ACTING_SURFACES as readonly string[]).includes(raw) ? (raw as ActingSurface) : null;
}

export type ShellToolsVerdict = { granted: true } | { granted: false; reason: string };

/**
 * True when `cwd` is the top of the linked talk worktree made for session
 * `sessionId`: its directory is named `talkWorktreeId(sessionId)`, its git
 * admin dir is a `worktrees/talk-*` dir, and that admin dir points back at
 * this directory (git's own `gitdir` file). Never throws.
 */
export function isOwnTalkWorktree(cwd: string, sessionId: string): boolean {
  const id = sessionId.trim();
  if (!id) return false;
  try {
    const top = realpathSync(cwd);
    return basename(top) === talkWorktreeId(id) && isLinkedTalkTop(top);
  } catch {
    return false;
  }
}

/**
 * True when `top` (a realpath) is the top of a linked talk worktree: its git
 * admin dir is a `worktrees/talk-*` dir and that dir's `gitdir` file points
 * back at this directory. Throws on an unreadable admin dir (callers catch).
 */
function isLinkedTalkTop(top: string): boolean {
  const gitDir = talkWorktreeGitDir(top);
  if (!gitDir) return false;
  const back = readFileSync(join(gitDir, "gitdir"), "utf8").trim();
  return Boolean(back) && realpathSync(resolve(gitDir, back)) === join(top, ".git");
}

/**
 * SAFE-3.a, local CLI half (REQ-cli-681): true when `cwd`, resolved through
 * symlinks, is exactly `worktree` (the linked worktree `task run` made for
 * this run, REQ-cli-122) and that is a linked talk worktree whose admin dir
 * points back at it. A subdirectory, the main checkout, a non-git folder or
 * any other worktree is false. Never throws.
 */
export function isCliRunWorktree(cwd: string, worktree: string): boolean {
  if (!worktree.trim()) return false;
  try {
    const top = realpathSync(cwd);
    return top === realpathSync(worktree) && isLinkedTalkTop(top);
  } catch {
    return false;
  }
}

/**
 * SAFE-3.a: may this attempt offer the allowlisted {@link SAFE3A_TOOLS}?
 * Re-reads the delegation depth, the run markers, the role session, the
 * surface stamp, the acting role and the cwd on every call. Never throws; any
 * doubt refuses.
 */
export async function shellToolsGate(opts: {
  env: NodeJS.ProcessEnv;
  cwd: string;
  /**
   * The top of the linked worktree a local `task run` made for this run
   * (REQ-cli-681). Read only for a run with no role session; only `taskRun`
   * sets it, in-process.
   */
  talkWorktree?: string;
}): Promise<ShellToolsVerdict> {
  const { env, cwd } = opts;
  if (delegateDepthFromEnv(env) > 0) {
    return { granted: false, reason: "a delegate or council worker never gets them" };
  }
  if ((env.CORVIDINHO_WATCH_SESSION_ID ?? "").trim()) {
    return { granted: false, reason: "WATCH runs never get them" };
  }
  if (isScheduleRunEnv(env)) {
    return { granted: false, reason: "scheduled runs never get them" };
  }
  if (!roleSessionActive(env)) return localCliVerdict(env, cwd, opts.talkWorktree);
  const surface = actingSurface(env);
  if (!surface || !SAFE3A_SURFACES.has(surface)) {
    return {
      granted: false,
      reason: `only the owner's chat, /session start, /work and their ask answers get them (this run: ${surface ?? "no surface"})`,
    };
  }
  let role;
  try {
    role = await resolveActingRole(env);
  } catch {
    role = null;
  }
  if (role !== "owner") {
    return { granted: false, reason: "only the owner's own runs get them" };
  }
  if (!isOwnTalkWorktree(cwd, env.CORVIDINHO_DISCORD_SESSION_ID ?? "")) {
    return { granted: false, reason: "the run is not in this talk's own worktree" };
  }
  return { granted: true };
}

/**
 * SAFE-3.a, local CLI half (REQ-cli-681): a run with no role session gets
 * them only as a local `task run` nothing spawned, in the worktree it made
 * for itself. Every product spawn sets a role session, so a Discord session
 * id or a surface stamp here means a spawn without one: refused.
 */
function localCliVerdict(
  env: NodeJS.ProcessEnv,
  cwd: string,
  talkWorktree: string | undefined,
): ShellToolsVerdict {
  if ((env.CORVIDINHO_DISCORD_SESSION_ID ?? "").trim() || (env[ACTING_SURFACE_ENV] ?? "").trim()) {
    return {
      granted: false,
      reason:
        "a run with no role session gets them only as a local CLI run, and this one carries a Discord session or surface stamp",
    };
  }
  if (!talkWorktree?.trim()) {
    return {
      granted: false,
      reason:
        "a local CLI run gets them only in the new worktree it made for itself, not with --here or outside a git repo",
    };
  }
  if (!isCliRunWorktree(cwd, talkWorktree)) {
    return { granted: false, reason: "the run is not at the top of the worktree this CLI run made for itself" };
  }
  return { granted: true };
}

/**
 * The one operator `Text` line a run emits when its allowlist names
 * {@link SAFE3A_TOOLS} the gate refused (never part of the reply).
 */
export function shellToolsRefusedLine(names: readonly string[], reason: string): string {
  return `[operator] SAFE-3.a: ${names.join(", ")} allowlisted but not offered: ${reason}`;
}

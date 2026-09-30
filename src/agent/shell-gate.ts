/**
 * SAFE-3.a (#83, #124): who is offered the shell, the language runners and
 * the Fledge core runs ({@link SAFE3A_TOOLS}).
 *
 * The model gets them only in the owner's own interactive runs, only when the
 * run's allowlist names them (SAFE-1 / CLI-3; the tier still filters, so they
 * need code tier), and only inside that talk's own worktree. Non-owners, WATCH
 * and schedules never get them. {@link shellToolsGate} decides this for one
 * execute attempt and re-reads everything on each attempt:
 *
 * - a delegate or council worker (delegation depth > 0) never gets them;
 * - a run with no role session (the local CLI) is refused: `task run` has no
 *   per-run talk worktree of its own yet (the CLI half of SAFE-3.a comes
 *   later);
 * - a WATCH run (`CORVIDINHO_WATCH_SESSION_ID`) or a scheduled run
 *   (`isScheduleRunEnv`) is refused whatever its stamp says;
 * - the surface stamp ({@link ACTING_SURFACE_ENV}, always overwritten by the
 *   spawning client) must be `chat`, `ask`, `session` or `work`
 *   ({@link SAFE3A_SURFACES}); `watch`, `schedule`, an unknown value and no
 *   stamp are refused;
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
    if (basename(top) !== talkWorktreeId(id)) return false;
    const gitDir = talkWorktreeGitDir(top);
    if (!gitDir) return false;
    const back = readFileSync(join(gitDir, "gitdir"), "utf8").trim();
    return Boolean(back) && realpathSync(resolve(gitDir, back)) === join(top, ".git");
  } catch {
    return false;
  }
}

/**
 * SAFE-3.a: may this attempt offer the allowlisted {@link SAFE3A_TOOLS}?
 * Re-reads the delegation depth, the surface stamp, the run markers, the
 * acting role and the cwd on every call. Never throws; any doubt refuses.
 */
export async function shellToolsGate(opts: {
  env: NodeJS.ProcessEnv;
  cwd: string;
}): Promise<ShellToolsVerdict> {
  const { env, cwd } = opts;
  if (delegateDepthFromEnv(env) > 0) {
    return { granted: false, reason: "a delegate or council worker never gets them" };
  }
  if (!roleSessionActive(env)) {
    return { granted: false, reason: "a local CLI run has no talk worktree of its own yet" };
  }
  if ((env.CORVIDINHO_WATCH_SESSION_ID ?? "").trim()) {
    return { granted: false, reason: "WATCH runs never get them" };
  }
  if (isScheduleRunEnv(env)) {
    return { granted: false, reason: "scheduled runs never get them" };
  }
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
 * The one operator `Text` line a run emits when its allowlist names
 * {@link SAFE3A_TOOLS} the gate refused (never part of the reply).
 */
export function shellToolsRefusedLine(names: readonly string[], reason: string): string {
  return `[operator] SAFE-3.a: ${names.join(", ")} allowlisted but not offered: ${reason}`;
}

/**
 * ROLES-CHAT role session + ADMIN re-check (ROLES-CHAT-4/6), and the three
 * roles of IDENTITY-8..12 (#65): owner, team, community.
 *
 * Bridge always sets CORVIDINHO_ACTING_IS_ADMIN to "0" or "1".
 * When the env key is unset (local interactive CLI), role gates do not apply.
 *
 * The role is resolved here, in the tool layer, on every call (IDENTITY-12):
 * - owner: the ADMIN re-check below (owner match + bridge bit, not muted or
 *   deny-listed) — everything, as ROLES-CHAT-4 (IDENTITY-9);
 * - team: the spawning surface allowed team (`CORVIDINHO_ACTING_ROLE=team`,
 *   Discord chat / slash / buttons only) AND the acting Discord user id
 *   resolves, in the owner's people list re-read now, to a person whose
 *   declared role is team (IDENTITY-8/10). The surface's stamp can only lower
 *   the role, never raise it;
 * - community: everyone else — undeclared people, declared community, WATCH,
 *   schedules other people create, delegate/council workers, a muted or
 *   deny-listed actor, or any read failure (IDENTITY-11/12).
 *
 * DISCORD-SCHEDULE-1.a: a schedule the owner created runs as the owner (the
 * scheduler stamps the ADMIN bit only for the live owner's own schedule, and
 * the ADMIN re-check above still applies at every call); anyone else's
 * schedule is community. A scheduled run (`isScheduleRunEnv`) is never team,
 * whatever its stamp says.
 */

import { loadAllowlist } from "../allowlist/load.ts";
import {
  isOwnerDiscord,
  loadOwnerConfig,
} from "../identity/owner.ts";
import {
  loadDeclaredPeople,
  resolvePerson,
  roleOfPerson,
  type PersonRole,
} from "../identity/people.ts";
import { isMutatingPlugin, type MutatingLike } from "./mutating.ts";

export const ROLE_REFUSED_MESSAGE =
  "not allowed for your role";

/** The role a role session acts with (IDENTITY-8). */
export type ActingRole = PersonRole;

/**
 * Env key the spawning surface sets: the most this surface allows for its
 * actor ("owner" | "team" | "community"). Only Discord chat, slash and
 * buttons stamp "team"; anything else ⇒ community (fail closed).
 */
export const ACTING_ROLE_ENV = "CORVIDINHO_ACTING_ROLE";

/** Env key set to "1" by `/work` runs only: team work tools apply (IDENTITY-10). */
export const ACTING_WORK_TASK_ENV = "CORVIDINHO_ACTING_WORK_TASK";

/**
 * Prefix of a scheduled run's session id (`schedule_<schedule id>`): the
 * scheduler builds its `sessionId` from it and the spawn client writes it to
 * `CORVIDINHO_DISCORD_SESSION_ID`. Chat talks are `sess_*`, `/work` runs
 * `work_*`.
 */
export const SCHEDULE_SESSION_PREFIX = "schedule_";

/**
 * True in a scheduled run's process (DISCORD-SCHEDULE-3.a):
 * `CORVIDINHO_DISCORD_SESSION_ID` starts with {@link SCHEDULE_SESSION_PREFIX}.
 * `delegate` / `council` workers inherit that key (the worker env drops only
 * `DISCORD_*`, `CORVIDINHO_ACTING_*` and token keys), so they count too.
 */
export function isScheduleRunEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.CORVIDINHO_DISCORD_SESSION_ID ?? "").startsWith(SCHEDULE_SESSION_PREFIX);
}

/**
 * Team reviews (IDENTITY-10): comment on issues/PRs and submit PR reviews.
 * Still dangerous (SAFE-1 allowlist, SAFE-5 audit) and, for team, allowlisted
 * repos only (GITHUB-6, `checkRepoGateForActingRole`).
 */
export const TEAM_REVIEW_TOOLS: ReadonlySet<string> = new Set([
  "github-issue-comment",
  "github-pr-review",
]);

/**
 * Team work tasks (IDENTITY-10): file edits inside a `/work` run's own
 * worktree (SAFE-2 protected paths still refused). The `/work` handler ships
 * the result as a draft PR (REQ-discord-088); the shell, runners, git and
 * other writes stay owner-only.
 */
export const TEAM_WORK_TOOLS: ReadonlySet<string> = new Set([
  "files-edit",
  "files-write",
]);

function truthy(raw: string | undefined): boolean {
  if (raw == null) return false;
  const s = raw.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function parseList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * True when Discord/WATCH/schedule (or any bridge) stamped an acting-admin bit.
 * Unset ⇒ no role session (developer CLI path).
 */
export function roleSessionActive(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Object.prototype.hasOwnProperty.call(env, "CORVIDINHO_ACTING_IS_ADMIN");
}

/**
 * Handler-time ADMIN re-check (ROLES-CHAT-6 / IDENTITY-2 / ADMIN-4).
 * Requires the bridge bit AND owner match; empty owner ⇒ nobody.
 */
export async function resolveActingIsAdmin(
  env: NodeJS.ProcessEnv = process.env,
  userId?: string,
): Promise<boolean> {
  if (!roleSessionActive(env)) return false;
  if (!truthy(env.CORVIDINHO_ACTING_IS_ADMIN)) return false;

  const actor =
    (userId ?? env.CORVIDINHO_ACTING_DISCORD_USER_ID ?? "").trim();
  if (!actor) return false;

  const id = actor.toLowerCase();
  let isOwner = false;
  try {
    isOwner = isOwnerDiscord((await loadOwnerConfig({ env })).owner, actor);
  } catch {
    isOwner = false;
  }
  if (!isOwner) return false;
  if (parseList(env.DISCORD_MUTED_USER_IDS).includes(id)) return false;
  try {
    const allow = await loadAllowlist({ env });
    if (allow.discord.denyUsers.includes(id)) return false;
  } catch {
    return false;
  }
  return true;
}

/**
 * The most the spawning surface allows (IDENTITY-12): `CORVIDINHO_ACTING_ROLE`
 * when it is "owner" or "team"; with no stamp, the ADMIN bit alone means
 * owner (spawners from before the three roles). Anything else ⇒ community.
 */
export function actingRoleCap(env: NodeJS.ProcessEnv = process.env): ActingRole {
  const raw = env[ACTING_ROLE_ENV];
  if (raw === undefined) return truthy(env.CORVIDINHO_ACTING_IS_ADMIN) ? "owner" : "community";
  const s = raw.trim().toLowerCase();
  return s === "owner" || s === "team" ? s : "community";
}

/** True when the run is a `/work` task (team work tools, IDENTITY-10). */
export function actingWorkTask(env: NodeJS.ProcessEnv = process.env): boolean {
  return truthy(env[ACTING_WORK_TASK_ENV]);
}

/**
 * Resolve the acting role at this call (IDENTITY-8..12). `null` ⇒ no role
 * session (local CLI: no role gates). A scheduled run is the owner (the
 * owner's own schedule, ADMIN re-check passed) or community, never team
 * (DISCORD-SCHEDULE-1.a). Never throws; any failure reads as community.
 */
export async function resolveActingRole(
  env: NodeJS.ProcessEnv = process.env,
  userId?: string,
): Promise<ActingRole | null> {
  if (!roleSessionActive(env)) return null;
  if (await resolveActingIsAdmin(env, userId)) return "owner";
  if (actingRoleCap(env) === "community") return "community";
  // DISCORD-SCHEDULE-1.a: schedules other people create stay read-only; a
  // scheduled run is never team, whatever its stamp says.
  if (isScheduleRunEnv(env)) return "community";
  const actor = (userId ?? env.CORVIDINHO_ACTING_DISCORD_USER_ID ?? "").trim();
  if (!actor) return "community";
  const id = actor.toLowerCase();
  if (parseList(env.DISCORD_MUTED_USER_IDS).includes(id)) return "community";
  try {
    const allow = await loadAllowlist({ env });
    if (allow.discord.denyUsers.includes(id)) return "community";
    const owner = (await loadOwnerConfig({ env, filePath: allow.sourcePath })).owner;
    // The owner's people list, re-read now (IDENTITY-12), matched on the
    // Discord user id only (IDENTITY-7).
    const person = resolvePerson(loadDeclaredPeople({ allowlist: allow, owner }), {
      discordId: actor,
    });
    return roleOfPerson(person) === "team" ? "team" : "community";
  } catch {
    return "community";
  }
}

/**
 * May `role` see and run `cmd` (IDENTITY-9..11 / ROLES-CHAT-2/3)? Read tools:
 * everyone. Mutating tools: the owner; team only its review tools, plus its
 * work tools in a `/work` run; community none. `null` (no role session) ⇒
 * no role gate.
 */
export function roleAllowsPlugin(
  role: ActingRole | null,
  cmd: MutatingLike,
  workTask = false,
): boolean {
  if (role === null) return true;
  if (!isMutatingPlugin(cmd)) return true;
  if (role === "owner") return true;
  if (role === "team") {
    return TEAM_REVIEW_TOOLS.has(cmd.name) || (workTask && TEAM_WORK_TOOLS.has(cmd.name));
  }
  return false;
}

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
 * - team (read tools, reviews, `web-search` and `gif-search` (PLUGIN-9) and
 *   `/work` edits):
 *   the spawning surface allowed team (`CORVIDINHO_ACTING_ROLE=team`,
 *   Discord chat / slash / buttons, or a WATCH run a team member triggered)
 *   AND the acting Discord user id (on GitHub: the trigger's GitHub numeric
 *   id, IDENTITY-12.a) resolves, in the owner's people list re-read now, to a
 *   person whose declared role is team (IDENTITY-8/10). The surface's stamp
 *   can only lower the role, never raise it;
 * - community: everyone else — undeclared people, declared community,
 *   schedules other people create, delegate/council workers, a muted or
 *   deny-listed actor, or any read failure (IDENTITY-11/12).
 *
 * IDENTITY-12.a (#65): on GitHub (a WATCH run: the surface stamp
 * `CORVIDINHO_ACTING_SURFACE=watch`, which both spawning clients always
 * overwrite, plus `CORVIDINHO_WATCH_SESSION_ID`) the person is the one who
 * triggered the run, matched by the GitHub numeric user id the poller stamps
 * (`CORVIDINHO_ACTING_GITHUB_ID`, from the GitHub API event) in the owner's
 * people list re-read now — never by a login, never by a Discord id. The
 * owner (owner stamp + ADMIN bit) gets the owner's tools and team (team
 * stamp) the team's, behind the same must-ask gate as on Discord; a WATCH
 * run is never a `/work` task. A GitHub id or login on the GitHub deny list,
 * or a declared person whose Discord id is muted or deny-listed, is
 * community; so is anyone undeclared. A Discord run never uses the GitHub
 * keys.
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
  normalizeGithubId,
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
 * buttons, and a WATCH run a declared team member triggered (IDENTITY-12.a),
 * stamp "team"; anything else ⇒ community (fail closed).
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
 * The surface stamp key (`ACTING_SURFACE_ENV` in src/agent/shell-gate.ts,
 * which imports this module): both spawning clients always overwrite it.
 */
const SURFACE_ENV = "CORVIDINHO_ACTING_SURFACE";

/**
 * True in a WATCH (GitHub) run's process (IDENTITY-12.a): the surface stamp
 * is `watch`. Its role comes from the GitHub trigger's numeric id only,
 * never from a Discord id.
 */
export function isWatchRunEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env[SURFACE_ENV] ?? "").trim().toLowerCase() === "watch";
}

/**
 * IDENTITY-12.a: the declared role of the person who triggered this WATCH
 * run, re-read now: the GitHub numeric user id the poller stamped
 * (`CORVIDINHO_ACTING_GITHUB_ID`) in the owner's people list (the owner's
 * `[owner] github_id` included, IDENTITY-7.a). No WATCH session id, no id, an
 * id or login on the GitHub deny list, an undeclared id, a declared person
 * whose Discord id is muted or Discord-deny-listed, or any read failure ⇒
 * community. Never throws.
 */
async function watchTriggerRoleNow(env: NodeJS.ProcessEnv): Promise<ActingRole> {
  if (!(env.CORVIDINHO_WATCH_SESSION_ID ?? "").trim()) return "community";
  const id = normalizeGithubId(env.CORVIDINHO_ACTING_GITHUB_ID?.trim() || undefined);
  if (!id) return "community";
  try {
    const allow = await loadAllowlist({ env });
    const deny = allow.github.denyUsers.map((d) => d.trim().toLowerCase());
    const login = (env.CORVIDINHO_ACTING_GITHUB_LOGIN ?? "").trim().toLowerCase();
    if (deny.includes(id) || (login && deny.includes(login))) return "community";
    const owner = (await loadOwnerConfig({ env, filePath: allow.sourcePath })).owner;
    const person = resolvePerson(loadDeclaredPeople({ allowlist: allow, owner }), { githubId: id });
    if (!person) return "community";
    const muted = parseList(env.DISCORD_MUTED_USER_IDS);
    const discordDeny = allow.discord.denyUsers.map((d) => d.trim().toLowerCase());
    for (const d of person.person.discordIds) {
      const did = d.toLowerCase();
      if (muted.includes(did) || discordDeny.includes(did)) return "community";
    }
    return roleOfPerson(person);
  } catch {
    return "community";
  }
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
 * worktree (SAFE-2 protected paths still refused), and working that repo's
 * SpecSync change for them (AGENT-18): opening and answering it, and, on
 * Corvidinho only, the approve and archive steps the run itself takes once
 * verify is green (AGENT-18.a; those two stay dangerous, so SAFE-1's
 * allowlist still applies). The `/work` handler ships the result as a draft
 * PR (REQ-discord-088); the shell, runners, git and other writes stay
 * owner-only.
 */
export const TEAM_WORK_TOOLS: ReadonlySet<string> = new Set([
  "files-edit",
  "files-write",
  "specsync-change-new",
  "specsync-change-answer",
  "specsync-change-approve",
  "specsync-change-finalize",
]);

/**
 * Team search (PLUGIN-9, #318): "Web search and GIF search are for me and the
 * team only, and stay off until I allow them, like web-fetch." Dangerous
 * (SAFE-1: offered and run only when `CORVIDINHO_ALLOWLIST` names them;
 * SAFE-5 audited), on every team session, not only `/work`. These tools
 * only (`web-search`, PLUGIN-7; `gif-search`, PLUGIN-8): `web-fetch` itself
 * stays owner-only. Community never gets them.
 */
export const TEAM_SEARCH_TOOLS: ReadonlySet<string> = new Set([
  "web-search",
  "gif-search",
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

  // IDENTITY-12.a: on GitHub the owner is the run's trigger, matched by the
  // GitHub numeric id only (owner stamp + ADMIN bit); never a Discord id.
  if (isWatchRunEnv(env)) {
    if (actingRoleCap(env) !== "owner") return false;
    return (await watchTriggerRoleNow(env)) === "owner";
  }

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

/**
 * True when the run is a `/work` task (team work tools, IDENTITY-10). A
 * WATCH run never is (IDENTITY-12.a: it works in the watcher's checkout,
 * not a `/work` worktree), whatever its stamp says.
 */
export function actingWorkTask(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isWatchRunEnv(env)) return false;
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
  // IDENTITY-12.a: on GitHub, team is the trigger's declared role by GitHub
  // numeric id (team stamp); never a Discord id.
  if (isWatchRunEnv(env)) return (await watchTriggerRoleNow(env)) === "team" ? "team" : "community";
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
 * everyone. Mutating tools: the owner; team only its review and search tools
 * (PLUGIN-9), plus its work tools in a `/work` run; community none. `null`
 * (no role session) ⇒ no role gate.
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
    return (
      TEAM_REVIEW_TOOLS.has(cmd.name) ||
      TEAM_SEARCH_TOOLS.has(cmd.name) ||
      (workTask && TEAM_WORK_TOOLS.has(cmd.name))
    );
  }
  return false;
}

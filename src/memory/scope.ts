/**
 * Memory scopes (MEMORY-5..7 / MEMORY-ACL-1, #101).
 *
 * A memory row's `owner_user_id` is its scope:
 * - a Discord user id — someone not on the owner's people list (and the
 *   configured owner while they are not declared under `[people]`), exactly
 *   as before (MEMORY-ACL-1);
 * - `person:<id>` — a declared person (#36): one profile however they reach
 *   Corvidinho, keyed by the declared person id (MEMORY-5). Rows stored under
 *   their Discord ids before they were declared are still read with it;
 * - `project:<key>` — a project's own memory (MEMORY-6), keyed by the repo
 *   (`owner/repo` of its `origin` remote, lowercased) or, without one, the
 *   real path of its main checkout, so every worktree of it shares one scope.
 *
 * The acting person comes from the bridge-set acting Discord id — or, in a
 * GitHub WATCH run, the poller-set commenter's GitHub id / login (MEMORY-8,
 * `memorySubjectForGithub`) — matched in the owner's people list re-read now
 * (stable ids only, IDENTITY-7), never from argv or the prompt. Who may
 * read which scope is decided in plugins/memory and the Discord / WATCH
 * injects: a person's memory only by them and the owner (MEMORY-7); project
 * memory by the owner and team, and by the local CLI (no role session), and
 * read-only by anyone in a GitHub WATCH run on that repo (MEMORY-8).
 */

import { realpathSync } from "node:fs";
import { dirname } from "node:path";
import { gitEnv } from "../../plugins/git/exec.ts";
import { repoSlugFromRemoteUrl } from "../../plugins/git/parse.ts";
import { loadAllowlist } from "../allowlist/load.ts";
import { loadOwnerConfig, type OwnerRecord } from "../identity/owner.ts";
import {
  loadDeclaredPeople,
  normalizeDiscordUserId,
  OWNER_PERSON_ID,
  PERSON_ID_RE,
  resolvePerson,
  roleOfPerson,
  type PeopleDirectory,
  type PersonRole,
} from "../identity/people.ts";

export const PERSON_SCOPE_PREFIX = "person:";
export const PROJECT_SCOPE_PREFIX = "project:";

/** Scope of a declared person's profile (MEMORY-5). */
export function personScopeId(personId: string): string {
  return `${PERSON_SCOPE_PREFIX}${personId}`;
}

/** Scope of a project's memory (MEMORY-6). */
export function projectScopeId(projectKey: string): string {
  return `${PROJECT_SCOPE_PREFIX}${projectKey}`;
}

export function isProjectScopeId(scope: string): boolean {
  return scope.startsWith(PROJECT_SCOPE_PREFIX);
}

/** Whose memory a call reads or writes (never a project). */
export type MemorySubject = {
  /** "person": declared (MEMORY-5); "user": undeclared, today's Discord-id scope. */
  kind: "person" | "user";
  /** Declared person id, or the Discord user id. */
  id: string;
  /** Scope new rows are stored in. */
  writeScope: string;
  /** Scopes read: the write scope plus the person's Discord ids (rows from before they were declared). */
  readScopes: string[];
  /** Discord user ids of this subject. */
  discordIds: string[];
  /** Declared display, else undefined (never a Discord display name). */
  displayName?: string;
  /** Role from the owner's people list (IDENTITY-8); undeclared ⇒ community. */
  role: PersonRole;
};

/**
 * Discord ids that resolve to `personId` now: an id declared for two people
 * matches nobody (IDENTITY-7), so rows under it are nobody's profile.
 */
export function linkedDiscordIds(dir: PeopleDirectory, personId: string): string[] {
  const person = dir.people.find((p) => p.id === personId);
  return (person?.discordIds ?? []).filter((id) => dir.byDiscordId.get(id) === personId);
}

function personSubject(dir: PeopleDirectory, personId: string, extraDiscordId?: string): MemorySubject | null {
  const person = dir.people.find((p) => p.id === personId);
  if (!person || person.id === OWNER_PERSON_ID) return null;
  const discordIds = [...new Set([...linkedDiscordIds(dir, person.id), ...(extraDiscordId ? [extraDiscordId] : [])])];
  const isOwner = dir.ownerPersonId === person.id;
  return {
    kind: "person",
    id: person.id,
    writeScope: personScopeId(person.id),
    readScopes: [personScopeId(person.id), ...discordIds],
    discordIds,
    ...(person.display ? { displayName: person.display } : {}),
    role: isOwner ? "owner" : person.role === "team" ? "team" : "community",
  };
}

function userSubject(dir: PeopleDirectory | null | undefined, discordId: string): MemorySubject {
  const resolved = dir ? resolvePerson(dir, { discordId }) : null;
  return {
    kind: "user",
    id: discordId,
    writeScope: discordId,
    readScopes: [discordId],
    discordIds: [discordId],
    role: roleOfPerson(resolved),
  };
}

/**
 * The subject for the acting Discord user id: their declared person (matched
 * on the Discord id only, IDENTITY-7), else their Discord id as before. The
 * configured owner stays on their Discord id until declared under
 * `[people]`. Blank or malformed id ⇒ null.
 */
export function memorySubjectFor(
  dir: PeopleDirectory | null | undefined,
  discordUserId: string | null | undefined,
): MemorySubject | null {
  const raw = (discordUserId ?? "").trim();
  if (!raw) return null;
  const discordId = normalizeDiscordUserId(raw) ?? raw;
  const resolved = dir ? resolvePerson(dir, { discordId }) : null;
  if (dir && resolved && resolved.personId !== OWNER_PERSON_ID) {
    const s = personSubject(dir, resolved.personId, discordId);
    if (s) return s;
  }
  return userSubject(dir, discordId);
}

/**
 * The subject a `--person` value names (the owner looking at someone's
 * memory, MEMORY-7): a declared person id, or a Discord user id / mention
 * (their declared person when they have one). Unknown ⇒ null.
 */
export function memorySubjectForRef(
  dir: PeopleDirectory | null | undefined,
  ref: string | null | undefined,
): MemorySubject | null {
  const raw = (ref ?? "").trim();
  if (!raw) return null;
  const discordId = normalizeDiscordUserId(raw);
  if (discordId) return memorySubjectFor(dir, discordId);
  const id = raw.toLowerCase();
  if (!dir || !PERSON_ID_RE.test(id)) return null;
  return personSubject(dir, id);
}

/**
 * The subject for a GitHub commenter (MEMORY-8, #67): the declared person
 * their GitHub numeric id / login resolves to in the owner's people list
 * (stable ids only, IDENTITY-7; never a name), the same profile as on
 * Discord. The configured owner while not declared under `[people]` keeps
 * their Discord-id scope, as on Discord. Undeclared (or ids pointing at two
 * people) ⇒ null: no personal memory on GitHub.
 */
export function memorySubjectForGithub(
  dir: PeopleDirectory | null | undefined,
  q: { login?: string | null; id?: string | number | null },
): MemorySubject | null {
  if (!dir) return null;
  const resolved = resolvePerson(dir, { githubLogin: q.login, githubId: q.id });
  if (!resolved) return null;
  if (resolved.personId === OWNER_PERSON_ID) {
    const ownerDiscord = dir.owner?.discordId;
    return ownerDiscord ? memorySubjectFor(dir, ownerDiscord) : null;
  }
  return personSubject(dir, resolved.personId);
}

const REPO_SLUG_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/**
 * Project scope of a GitHub `owner/repo` (MEMORY-6 / MEMORY-8): the key a
 * checkout of that repo gets from its `origin` remote (lowercased), so a
 * GitHub thread reads the memory the owner and team keep for that repo.
 * Not an `owner/repo` ⇒ null.
 */
export function projectScopeForRepo(repo: string | null | undefined): { scope: string; key: string } | null {
  const slug = (repo ?? "").trim();
  if (!REPO_SLUG_RE.test(slug) || slug.split("/").some((p) => p === "." || p === "..")) return null;
  const key = slug.toLowerCase();
  return { scope: projectScopeId(key), key };
}

/** Same subject (same write scope)? */
export function sameSubject(a: MemorySubject | null, b: MemorySubject | null): boolean {
  return !!a && !!b && a.writeScope === b.writeScope;
}

/** A human label for a subject: declared display, else the person id / Discord mention. */
export function subjectLabel(s: MemorySubject): string {
  if (s.displayName) return `${s.displayName} (${s.kind === "person" ? s.id : `<@${s.id}>`})`;
  return s.kind === "person" ? s.id : `<@${s.id}>`;
}

export type LoadedPeople = {
  dir: PeopleDirectory | null;
  owner: OwnerRecord | null;
};

/**
 * The owner config and people list as the tool layer reads them (the same
 * files as `resolveActingRole`, re-read now). Never throws: a read failure
 * reads as nobody declared (subjects fall back to Discord ids).
 */
export async function loadPeopleForMemory(env: NodeJS.ProcessEnv = process.env): Promise<LoadedPeople> {
  try {
    const allow = await loadAllowlist({ env });
    const owner = (await loadOwnerConfig({ env, filePath: allow.sourcePath })).owner;
    return { dir: loadDeclaredPeople({ allowlist: allow, owner }), owner };
  } catch {
    return { dir: null, owner: null };
  }
}

const GIT_TIMEOUT_MS = 5000;

function gitOut(dir: string, args: string[]): string | null {
  try {
    const r = Bun.spawnSync(
      ["git", "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", ...args],
      {
        cwd: dir,
        env: gitEnv(dir),
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        timeout: GIT_TIMEOUT_MS,
      },
    );
    if (r.exitCode !== 0) return null;
    return new TextDecoder().decode(r.stdout).trim() || null;
  } catch {
    return null;
  }
}

function realOr(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * The project key of `dir` (MEMORY-6): `owner/repo` of the checkout's
 * `origin` remote (lowercased; credentials in the URL never kept), else the
 * real path of the main checkout (so a talk worktree shares its repo's
 * memory), else the real path of `dir`. Only `dir` itself is examined for a
 * repository (a plain folder inside another repo is its own project).
 */
export function projectKeyFor(dir: string): string {
  const real = realOr(dir);
  const common = gitOut(real, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (!common) return real;
  const url = gitOut(real, ["remote", "get-url", "origin"]);
  const slug = url ? repoSlugFromRemoteUrl(url.split("\n")[0] ?? "") : null;
  if (slug) return slug.toLowerCase();
  return common.endsWith("/.git") ? realOr(dirname(common)) : real;
}

/** Project scope of `dir`. */
export function projectScopeFor(dir: string): { scope: string; key: string } {
  const key = projectKeyFor(dir);
  return { scope: projectScopeId(key), key };
}

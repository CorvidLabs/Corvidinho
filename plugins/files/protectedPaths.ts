/**
 * SAFE-2 protected project infra — hard refuse overwrite/delete via file tools.
 * No in-band override (Merlin files-delete pattern).
 */

import { lstatSync, readlinkSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { PROJECT_INSTRUCTION_FILES } from "../../src/agent/project-instructions.ts";
import { defaultAllowlistPaths, resolveAllowlistPath } from "../../src/allowlist/load.ts";
import { CORVIDINHO_ROOT } from "../../src/agent/persona.ts";
import { PERSONAS_DIR } from "../../src/agent/personas.ts";
import {
  isWatchRunEnv,
  resolveActingIsAdmin,
  roleSessionActive,
} from "../../src/plugins/roles.ts";
import { isGitRepo } from "../../src/worktree/manager.ts";
import { isInsideRoot, realRoot, resolveProjectPath } from "./resolvePath.ts";

function pathParts(p: string): string[] {
  return p.split("/").filter((part) => part.length > 0 && part !== ".");
}

/**
 * True when a path component contains `keystore`: a keystore file, or any
 * file under a keystore directory (the component rule isSecretPath uses).
 * A SpecSync change folder's name (`.specsync/changes/<id>/`,
 * `.specsync/archive/changes/<id>/`) is a slug of the change title, not a
 * keystore, so it does not count; the components below it still do.
 */
export function hasKeystoreComponent(parts: readonly string[]): boolean {
  const lower = parts.map((p) => p.toLowerCase());
  return lower.some((part, i) => {
    if (!part.includes("keystore")) return false;
    const changeFolder =
      i < lower.length - 1 &&
      lower[i - 1] === "changes" &&
      (lower[i - 2] === ".specsync" ||
        (lower[i - 2] === "archive" && lower[i - 3] === ".specsync"));
    return !changeFolder;
  });
}

/**
 * True when path looks like protected project infrastructure (SAFE-2).
 *
 * Pass the project `root` with an absolute path: the keystore rule then reads
 * only the components below the root, so a project checked out under a
 * directory such as `~/keystore-tools/` does not become read-only as a whole.
 * The exact-name rules (.git / .env* / specs / .specsync / .fledge) read the
 * whole path.
 */
export function isProtectedPath(filePath: string, root?: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = pathParts(normalized);

  for (let i = 0; i < parts.length; i++) {
    const lower = parts[i]!.toLowerCase();
    if (lower === ".git") return true;
    if (lower === ".env" || lower.startsWith(".env.")) return true;
    if (lower === "specs") return true;
    // Fledge lane imports and config (`.fledge/lanes/*.toml`): the verify gate
    // runs them, so a run must not rewrite the checks it is judged by
    // (SAFE-2.a). Reads stay allowed.
    if (lower === ".fledge") return true;
    // SpecSync config, registry and archived changes. Files inside an active
    // change folder (`.specsync/changes/<id>/…`) stay writable so the agent
    // can fill change artifacts (SPECSYNC-4); `.specsync/changes` and
    // `.specsync/changes/<id>` themselves do not, so a file planted where
    // SpecSync needs a folder cannot switch the change machinery off.
    if (
      lower === ".specsync" &&
      (parts[i + 1]?.toLowerCase() !== "changes" || parts.length < i + 4)
    ) {
      return true;
    }
  }

  // Any keystore file or directory (`keystore/UTC--…`, `my.keystore`).
  let inProject = parts;
  if (root && isAbsolute(filePath)) {
    const rel = relative(root, filePath).replace(/\\/g, "/");
    if (rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel)) {
      inProject = pathParts(rel);
    }
  }
  if (hasKeystoreComponent(inProject)) return true;

  const baseLower = basename(normalized).toLowerCase();
  if (baseLower === "fledge.toml") return true;
  // Trust config: in a repo that has it the verify gate also runs `fledge
  // trust verify`, so a run must not rewrite or delete it (AGENT-18).
  if (baseLower === ".trust.toml") return true;
  // Bun runtime config: a planted `preload` runs code in every spawned agent.
  if (baseLower === "bunfig.toml" || baseLower === ".bunfig.toml") return true;
  if (baseLower.endsWith(".spec.md")) return true;

  return false;
}

/**
 * AGENT-18 / AGENT-18.a: SpecSync's own lifecycle records in an active change
 * folder, the `*.json` files directly in `.specsync/changes/<id>/` (state,
 * approvals, review, verification, finalization). Only the `specsync change`
 * commands write them: a file tool that could would let a run widen the
 * paths its change covers past the coverage gate, put acceptance criteria in
 * past the hi check, or write an approval or review a human owes. The
 * change's artifacts (`*.md`, `deltas/…`) stay writable (SPECSYNC-4). Kept
 * out of {@link isProtectedPath}, so archiving a change still stages their
 * deletion.
 */
export function isSddRecordPath(filePath: string): boolean {
  const parts = pathParts(filePath.replace(/\\/g, "/"));
  for (let i = 0; i + 3 < parts.length; i++) {
    if (parts[i]!.toLowerCase() !== ".specsync") continue;
    if (parts[i + 1]!.toLowerCase() !== "changes") continue;
    if (parts.length === i + 4 && parts[i + 3]!.toLowerCase().endsWith(".json")) return true;
  }
  return false;
}

export function sddRecordRefuseMessage(path: string): string {
  return (
    `refused (SAFE-2): '${path}' is a SpecSync lifecycle record (state, approvals, review, verification); ` +
    `only the specsync change commands write it. Answer the change's interview with specsync-change-answer ` +
    `and fill its .md artifacts; approving, reviewing and finalizing are never a file edit (AGENT-18, AGENT-18.a).`
  );
}

/**
 * AGENT-1.b: in a project folder that isn't a git repo (`isGitRepo(cwd)`
 * false), the root `AGENTS.md` and `CLAUDE.md` are read from disk into every
 * run's prompt (AGENT-1, `PROJECT_INSTRUCTION_FILES`), so the file tools
 * never change them; the owner edits them. `absPath` is where the tool would
 * write (`resolveProjectPath`). True for the root names themselves, anything
 * under them, the file a symlink of that name leads to (the loader reads
 * through it), and a hard link to one. A git project is unchanged: there only
 * the committed copy is loaded.
 */
export function isNonGitRootInstructionPath(absPath: string, cwd: string): boolean {
  if (isGitRepo(cwd)) return false;
  const root = realRoot(cwd);
  for (const name of PROJECT_INSTRUCTION_FILES) {
    const named = join(root, name);
    const targets = [named];
    try {
      targets.push(resolveProjectPath(cwd, name));
    } catch {
      /* a link out of the project: the loader refuses it, the tools can't reach it */
    }
    if (targets.some((t) => isInsideRoot(t, absPath))) return true;
    try {
      const a = statSync(absPath);
      const b = statSync(named);
      if (a.isFile() && b.isFile() && a.dev === b.dev && a.ino === b.ino) return true;
    } catch {
      /* either missing: no shared inode */
    }
  }
  return false;
}

/** Symlink hops followed by hand for a dangling link (Linux SYMLOOP_MAX). */
const MAX_LINK_HOPS = 40;

/**
 * Where a read or write of `p` lands: symlinks resolved, a missing leaf
 * placed under its parent's real path, and a dangling link followed by hand
 * (a write through it creates its target) — as `resolveProjectPath` does
 * for the file tools' own target, without the project clamp.
 */
function landingPath(p: string, hops = 0): string {
  const abs = resolve(p);
  try {
    return realpathSync(abs);
  } catch {
    /* missing, or a dangling / looping link */
  }
  const dir = dirname(abs);
  if (dir === abs) return abs;
  const leaf = join(landingPath(dir, hops), basename(abs));
  if (hops < MAX_LINK_HOPS) {
    try {
      if (lstatSync(leaf).isSymbolicLink()) {
        return landingPath(resolve(dirname(leaf), readlinkSync(leaf)), hops + 1);
      }
    } catch {
      /* missing */
    }
  }
  return leaf;
}

/**
 * IDENTITY-6 / ALLOW-6: the allowlist files this process reads people (and
 * their links and roles), the owner and the allow/deny lists from —
 * `resolveAllowlistPath(env, home)` (`CORVIDINHO_ALLOWLIST_FILE`, else the
 * first of `~/.config/corvidinho/allowlist.toml|json` that exists) plus both
 * default paths, since creating either would make it the file read (`.toml`
 * first). `home` is `homedir()` and, when it differs, `env.HOME`. A relative
 * `CORVIDINHO_ALLOWLIST_FILE` is taken from this process's cwd (where its
 * loader reads it) and from home (as the shell's SAFE-21 guard does). Each
 * path as written and where it lands (`landingPath`).
 */
export function allowlistFilePaths(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string[] {
  const homes = [home];
  const envHome = env.HOME?.trim();
  if (envHome && isAbsolute(envHome) && envHome !== home) homes.push(envHome);
  const named = new Set<string>();
  for (const h of homes) {
    const p = resolveAllowlistPath(env, h);
    if (p) {
      named.add(resolve(p));
      if (!isAbsolute(p)) named.add(resolve(h, p));
    }
    for (const d of defaultAllowlistPaths(h)) named.add(resolve(d));
  }
  const out = new Set<string>();
  for (const p of named) {
    out.add(p);
    out.add(landingPath(p));
  }
  return [...out];
}

/**
 * IDENTITY-6 / ALLOW-6: true when `absPath` — where a file tool's write,
 * edit or delete would land (`resolveProjectPath`, symlinks resolved) — is
 * one of {@link allowlistFilePaths}, or a regular file sharing the inode of
 * one (a hard link). Only the owner changes a person's links, outside chat:
 * `/admin people` (audited) or the file on the VM.
 */
export function isAllowlistFilePath(
  absPath: string,
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): boolean {
  const target = resolve(absPath);
  let st: ReturnType<typeof statSync> | null = null;
  try {
    st = statSync(target);
  } catch {
    /* missing: compared by path only */
  }
  for (const p of allowlistFilePaths(env, home)) {
    if (p === target) return true;
    if (!st?.isFile()) continue;
    try {
      const b = statSync(p);
      if (b.isFile() && b.dev === st.dev && b.ino === st.ino) return true;
    } catch {
      /* missing: no shared inode */
    }
  }
  return false;
}

export function allowlistFileRefuseMessage(path: string): string {
  return (
    `refused (IDENTITY-6): '${path}' is Corvidinho's allowlist file, which holds the people it knows ` +
    `(their linked accounts and roles), the owner and the allow/deny lists. Only the owner adds, changes ` +
    `or removes a person's links, never through chat, and widening an allowlist is a config change the ` +
    `owner makes (ALLOW-6), so the file tools never write, edit or delete it. The owner uses ` +
    `/admin people add|link|unlink|remove|role (audited) or edits the file on the VM.`
  );
}

export function rootInstructionRefuseMessage(path: string): string {
  return (
    `refused (AGENT-1.b): '${path}' is this project's root AGENTS.md / CLAUDE.md (or the file one leads to). ` +
    `In a project folder that isn't a git repo they are read into every run's instructions, ` +
    `so the file tools never change them; the owner edits them outside the agent.`
  );
}

/**
 * SAFE-2 / AUTONOMOUS-2.a: Corvidinho's own named persona files — the
 * `personas/` folder next to `persona.md` at the root of the checkout runs
 * read them from (`root`, default `CORVIDINHO_ROOT`) — are owner-edited
 * config: the file tools never write, edit or delete there. `absPath` is
 * where the tool would write (`resolveProjectPath`, symlinks resolved). Only
 * that one folder: a project's own `personas/` directory is not touched.
 * Runs also load only the committed copy (like `persona.md`), so this is a
 * second wall, not the only one.
 */
export function isLivePersonaPath(absPath: string, root: string = CORVIDINHO_ROOT): boolean {
  return isInsideRoot(join(realRoot(root), PERSONAS_DIR), absPath);
}

export function livePersonaRefuseMessage(path: string): string {
  return (
    `refused (SAFE-2): '${path}' is in Corvidinho's ${PERSONAS_DIR}/ folder, the named persona files ` +
    `(AUTONOMOUS-2.a). They are owner-edited config: the file tools never change them; the owner edits and commits them.`
  );
}

/**
 * AGENT-18 hi guard: true when a project-relative path is `hi/` or under it,
 * where a hi repo keeps its acceptance criteria (case-insensitive, like the
 * SAFE-2 names). Only the file tools' write, edit and delete check it, and
 * only in a repo that uses hi (`refuseHi`, plugins/files/commands.ts).
 */
export function isHiPath(relPath: string): boolean {
  const parts = pathParts(relPath.replace(/\\/g, "/"));
  return parts[0]?.toLowerCase() === "hi";
}

export function hiRefuseMessage(path: string): string {
  return (
    `refused (AGENT-18): '${path}' is under hi/, where this repo keeps its acceptance criteria. ` +
    `The agent never changes them itself: criteria change only through a capture the owner approves on a card, ` +
    `and any other hi/ change keeps the run from being verified and /work from opening a PR. ` +
    `Reading hi/ is fine; draft a missing criterion with hi-draft where this run has it, else say in your reply what you think is missing or wrong.`
  );
}

export function protectedRefuseMessage(path: string): string {
  return (
    `refused (SAFE-2): '${path}' is protected project infra ` +
    `(.env* / .git / fledge.toml / .fledge / .trust.toml / bunfig.toml / specs / *.spec.md / .specsync / keystores). ` +
    `There is NO override — edit via SpecSync or outside the agent file tools.`
  );
}

/**
 * Secret-looking paths — refused on read for non-ADMIN community sessions
 * (ROLES-CHAT-8). Narrower than SAFE-2 write protection (does not block specs/).
 */
export function isSecretPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter((p) => p.length > 0 && p !== ".");
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === ".env" || lower.startsWith(".env.")) return true;
    if (lower === ".ssh") return true;
    if (lower.includes("keystore")) return true;
  }
  const base = parts.length ? parts[parts.length - 1]!.toLowerCase() : "";
  if (base === "credentials" || base === "credentials.json") return true;
  if (base === "id_rsa" || base === "id_ed25519" || base.endsWith(".pem")) return true;
  if (base === "wallet-keystore.json") return true;
  return false;
}

/**
 * grep globs mirroring isSecretPath, so a recursive search never opens a
 * secret file (ROLES-CHAT-8). grep globs are case-sensitive and isSecretPath
 * is not, so callers still drop result lines whose file isSecretPath matches.
 */
export const SECRET_GREP_EXCLUDES: readonly string[] = [
  "--exclude=.env",
  "--exclude=.env.*",
  "--exclude=*keystore*",
  "--exclude=credentials",
  "--exclude=credentials.json",
  "--exclude=id_rsa",
  "--exclude=id_ed25519",
  "--exclude=*.pem",
  "--exclude-dir=.env",
  "--exclude-dir=.env.*",
  "--exclude-dir=.ssh",
  "--exclude-dir=*keystore*",
];

/**
 * git exclude pathspecs mirroring isSecretPath (any `.env` / `.env.*` / `.ssh`
 * / `*keystore*` component; key, `*.pem` and credentials basenames), so a
 * non-ADMIN `git-diff` never prints a tracked secret file (ROLES-CHAT-8).
 * `icase` matches isSecretPath's case folding; `**` / `/**` match any depth.
 */
export const SECRET_GIT_EXCLUDE_PATHSPECS: readonly string[] = [
  "**/.env",
  "**/.env/**",
  "**/.env.*",
  "**/.env.*/**",
  "**/.ssh",
  "**/.ssh/**",
  "**/*keystore*",
  "**/*keystore*/**",
  "**/credentials",
  "**/credentials.json",
  "**/id_rsa",
  "**/id_ed25519",
  "**/*.pem",
].map((glob) => `:(exclude,glob,icase)${glob}`);

/**
 * ROLES-CHAT-8: true when this call runs in a non-ADMIN role session, so the
 * read-ish file tools refuse an explicit secret path and leave secret paths
 * out of listings and searches. ADMIN and the local CLI (no role session) keep
 * full access. Re-checked each call (ROLES-CHAT-6). A WATCH run is refused
 * for every role, the owner's included (IDENTITY-12.a): its answer goes to a
 * GitHub thread, which is public.
 */
export async function secretPathsRefused(): Promise<boolean> {
  if (!roleSessionActive()) return false;
  if (isWatchRunEnv()) return true;
  return !(await resolveActingIsAdmin());
}

export function secretRefuseMessage(path: string): string {
  return (
    `refused (ROLES-CHAT-8): '${path}' looks like a secret path ` +
    `(.env* / .ssh / keys / keystores) — not available in community chat or on GitHub`
  );
}

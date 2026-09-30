/**
 * `corvidinho doctor` checks that read what the long-running surfaces read
 * (CLI-4: say what is missing instead of failing later mid-task):
 * - Discord channel / GitHub repo allowlists through the same loader as the
 *   bridge and WATCH (allowlist file + env overlays, deny wins; ALLOW-1..4),
 *   naming where the entries came from (file / env), never the entries.
 * - The LLM key `task run` uses (none ⇒ demo stub).
 * - The shared data dir (exists / can be created, writable).
 * - The nightly backup (OPS-1/2): off when CORVIDINHO_BACKUP_DIR is unset,
 *   else the directory, its snapshots and the last backup / restore test.
 * - The project files `task run`'s verify gate reads in the current dir
 *   (`fledge.toml`, its verify lane with spec-check, `.specsync/`, `specs/`),
 *   shared with the report-only `corvidinho init`.
 * - A removed verify switch (`[corvidinho] verify_before_complete`) still set
 *   in `fledge.toml`: ignored, so `[warn]` (AGENT-14).
 * Secret and list values are never printed (SAFE-6).
 */

import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { removedVerifyKeys } from "./agent/config.ts";
import { loadLlmEnv } from "./agent/execute.ts";
import { findProjectRoot } from "./agent/project-instructions.ts";
import { perTierModels } from "./agent/tier.ts";
import { checkChannel } from "./allowlist/discord.ts";
import { isRepoAllowed } from "./allowlist/github.ts";
import {
  configFromEnvOnly,
  loadAllowlist,
  loadAllowlistFile,
  resolveAllowlistPath,
} from "./allowlist/load.ts";
import type { AllowlistConfig } from "./allowlist/types.ts";
import { AnnounceStore } from "./discord/announce-store.ts";
import { mergeChannelIds } from "./discord/config.ts";
import {
  BACKUP_DIR_ENV,
  BACKUP_HOUR,
  BACKUP_KEEP,
  backupDirRefusal,
  listSnapshots,
  readBackupStatus,
  resolveBackupConfig,
  type BackupStatus,
} from "./store/backup.ts";
import { defaultDbPath, resolveDataDir } from "./store/paths.ts";
import { expandWatchRepos } from "./watch/config.ts";

export type DoctorCheck = {
  name: string;
  ok: boolean;
  detail: string;
  /** Printed label override (informational checks never fail doctor). */
  mark?: string;
};

/** Where usable allowlist entries came from. */
export type AllowlistSource = "file" | "env";

/**
 * Allowlists as the bridge / WATCH load them (`merged`), plus the file-only
 * and env-only halves so doctor can name the source. `ok: false` when the
 * file exists but cannot be read or parsed (bridge / watch refuse to start).
 */
export type DoctorAllowlist =
  | { ok: true; merged: AllowlistConfig; file: AllowlistConfig | null; env: AllowlistConfig }
  | { ok: false; error: string };

/**
 * Usable (allowlisted and not deny-listed) entry count and its sources;
 * `denied` counts listed entries a deny list refuses (the rest of
 * `listed - usable` are entries the gate cannot use, e.g. not OWNER/REPO).
 */
export type AllowlistUsage = {
  listed: number;
  usable: number;
  denied: number;
  sources: AllowlistSource[];
};

/**
 * Resolves and reads the allowlist file once, exactly as `loadAllowlist` does
 * for the bridge / WATCH, then merges the env overlays through `loadAllowlist`
 * itself (`preloaded`), so the merged set and the file half come from the
 * same read.
 */
export async function loadDoctorAllowlist(
  env: NodeJS.ProcessEnv = process.env,
  home?: string,
): Promise<DoctorAllowlist> {
  const path = resolveAllowlistPath(env, home);
  let file: AllowlistConfig | null = null;
  if (path && existsSync(path)) {
    const loaded = await loadAllowlistFile(path);
    if (!loaded.ok) return { ok: false, error: loaded.error };
    file = { sourcePath: path, github: loaded.github, discord: loaded.discord };
  }
  const merged = await loadAllowlist({
    env,
    home,
    filePath: null,
    preloaded: file ? { sourcePath: path!, github: file.github, discord: file.discord } : null,
  });
  return { ok: true, merged, file, env: configFromEnvOnly(env) };
}

function sourcesOf(
  usable: string[],
  file: Iterable<string>,
  fromEnv: Iterable<string>,
): AllowlistSource[] {
  const f = new Set(file);
  const e = new Set(fromEnv);
  const out: AllowlistSource[] = [];
  if (usable.some((x) => f.has(x))) out.push("file");
  if (usable.some((x) => e.has(x))) out.push("env");
  return out;
}

/** Bridge channel set (`mergeChannelIds`), minus deny-listed channels. */
export function discordChannelUsage(
  allow: Extract<DoctorAllowlist, { ok: true }>,
  env: NodeJS.ProcessEnv = process.env,
): AllowlistUsage {
  const listed = mergeChannelIds(allow.merged, env);
  const gate: AllowlistConfig = {
    ...allow.merged,
    discord: { ...allow.merged.discord, channels: listed },
  };
  const usable = listed.filter((id) => checkChannel(id, gate).ok);
  return {
    listed: listed.length,
    usable: usable.length,
    // A listed channel fails the channel gate only on a deny list.
    denied: listed.length - usable.length,
    sources: sourcesOf(
      usable,
      allow.file?.discord.channels ?? [],
      mergeChannelIds(allow.env, env),
    ),
  };
}

/** WATCH repo set (`expandWatchRepos`), minus deny-listed repos / orgs. */
export function githubRepoUsage(
  allow: Extract<DoctorAllowlist, { ok: true }>,
): AllowlistUsage {
  const listed = expandWatchRepos(allow.merged);
  const gates = listed.map((r) => ({ r, gate: isRepoAllowed(r, allow.merged.github) }));
  const usable = gates.filter((g) => g.gate.ok).map((g) => g.r);
  const denied = gates.filter((g) => !g.gate.ok && g.gate.error.endsWith(" is denied")).length;
  return {
    listed: listed.length,
    usable: usable.length,
    denied,
    sources: sourcesOf(
      usable,
      allow.file ? expandWatchRepos(allow.file) : [],
      expandWatchRepos(allow.env),
    ),
  };
}

/** Set and not blank — the bridge / WATCH trim tokens and logins the same way. */
function present(env: NodeJS.ProcessEnv, name: string): boolean {
  return (env[name]?.trim() ?? "").length > 0;
}

function fromText(sources: AllowlistSource[]): string {
  return sources.join(" + ");
}

const ALLOWLIST_BROKEN = "the allowlist file does not load (see allowlist-file)";

export function discordDoctorCheck(
  allow: DoctorAllowlist,
  env: NodeJS.ProcessEnv = process.env,
): DoctorCheck {
  const name = "discord";
  if (!present(env, "DISCORD_TOKEN") && !present(env, "DISCORD_BOT_TOKEN")) {
    return {
      name,
      ok: false,
      detail:
        "missing DISCORD_TOKEN or DISCORD_BOT_TOKEN (go-live: token + non-empty Discord allowlists)",
    };
  }
  if (!allow.ok) {
    return {
      name,
      ok: false,
      detail: `token present but ${ALLOWLIST_BROKEN} — the bridge refuses to start`,
    };
  }
  const use = discordChannelUsage(allow, env);
  if (use.usable > 0) {
    return {
      name,
      ok: true,
      detail: `token + ${use.usable} allowlisted channel(s) from ${fromText(use.sources)} (values not shown)`,
    };
  }
  return {
    name,
    ok: false,
    detail:
      use.listed > 0
        ? "token present but every allowlisted channel is also deny-listed (deny wins) — the bridge hears no channel"
        : "token present but channel allowlist empty — set DISCORD_CHANNEL_IDS or CORVIDINHO_DISCORD_ALLOW_CHANNELS or allowlist file [discord].channels",
  };
}

export function githubWatchDoctorCheck(
  allow: DoctorAllowlist,
  env: NodeJS.ProcessEnv = process.env,
): DoctorCheck {
  const name = "github-watch";
  const fail = (detail: string): DoctorCheck => ({ name, ok: false, detail });
  if (!present(env, "GITHUB_TOKEN") && !present(env, "GH_TOKEN")) {
    return fail("WATCH needs GITHUB_TOKEN/GH_TOKEN (poll-first; see docs/WATCH.md)");
  }
  if (!present(env, "CORVIDINHO_WATCH_USERNAME") && !present(env, "GITHUB_WATCH_USERNAME")) {
    return fail("set CORVIDINHO_WATCH_USERNAME (login to listen for)");
  }
  if (!allow.ok) return fail(`${ALLOWLIST_BROKEN} — watch refuses to start`);
  const use = githubRepoUsage(allow);
  if (use.usable > 0) {
    return {
      name,
      ok: true,
      detail: `token + username + ${use.usable} allowlisted repo/org entr${use.usable === 1 ? "y" : "ies"} from ${fromText(use.sources)} (values not shown)`,
    };
  }
  return fail(
    use.listed === 0
      ? "set CORVIDINHO_GITHUB_ALLOW_REPOS / ORGS or allowlist file [github] repos / orgs (empty = deny-all)"
      : use.denied === use.listed
        ? "every allowlisted repo/org is also deny-listed (deny wins) — WATCH acts on no repo"
        : "no allowlisted repo/org entry is usable (deny-listed, or a repo that is not OWNER/REPO / an org that is not a bare name) — WATCH acts on no repo",
  );
}

/**
 * `; per tier: read …, tool …, code …` when any per-tier model key is set
 * (AGENT-5), else "" so the line reads as before. Model names only.
 */
function perTierModelsDetail(env: NodeJS.ProcessEnv): string {
  const m = perTierModels(env);
  return m ? `; per tier: read ${m.read}, tool ${m.tool}, code ${m.code}` : "";
}

/** `task run` without a key uses the demo stub: warn, never fail doctor. */
export function llmDoctorCheck(env: NodeJS.ProcessEnv = process.env): DoctorCheck {
  const llm = loadLlmEnv(env);
  if (llm.apiKey) {
    return {
      name: "llm",
      ok: true,
      detail: `CORVIDINHO_LLM_API_KEY/OPENAI_API_KEY present (value not shown); model ${llm.model}${perTierModelsDetail(env)}`,
    };
  }
  return {
    name: "llm",
    ok: true,
    mark: "warn",
    detail:
      "no CORVIDINHO_LLM_API_KEY or OPENAI_API_KEY — task run uses the demo stub (no model is called)",
  };
}

function errCode(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "error";
}

/** True for stat errors that mean "nothing there (yet)". */
function isMissing(e: unknown): boolean {
  const code = errCode(e);
  return code === "ENOENT" || code === "ENOTDIR";
}

/**
 * A symlink whose target does not exist: `stat` says ENOENT, yet `mkdir -p`
 * fails on it (EEXIST), so it is not "created on first use".
 */
function isBrokenLink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * The data dir holds `corvidinho.db` for the bridge, WATCH, daemon and memory
 * tools. Probes by creating and removing a temp dir (in the data dir, or in
 * its nearest existing parent when it does not exist yet); leaves nothing.
 */
export function dataDirDoctorCheck(
  env: NodeJS.ProcessEnv = process.env,
  home?: string,
): DoctorCheck {
  const dir = resolve(resolveDataDir({ env, home }));
  const fail = (why: string): DoctorCheck => ({
    name: "data-dir",
    ok: false,
    mark: "fail",
    detail: `${dir} ${why} — the bridge, watch, daemon and memory tools cannot open corvidinho.db; set CORVIDINHO_DATA_DIR to a writable directory`,
  });

  let exists = false;
  try {
    if (!statSync(dir).isDirectory()) return fail("is not a directory");
    exists = true;
  } catch (e) {
    if (!isMissing(e)) return fail(`cannot be read (${errCode(e)})`);
    if (isBrokenLink(dir)) return fail("is a symlink to a path that does not exist");
  }

  let probeIn = dir;
  if (!exists) {
    // mkdir -p starts at the nearest existing parent.
    for (let cur = dir; ; ) {
      const parent = dirname(cur);
      if (parent === cur) return fail("cannot be created (no existing parent)");
      cur = parent;
      try {
        if (!statSync(cur).isDirectory()) {
          return fail(`cannot be created (${cur} is not a directory)`);
        }
        probeIn = cur;
        break;
      } catch (e) {
        if (!isMissing(e)) return fail(`cannot be created (${errCode(e)})`);
        if (isBrokenLink(cur)) {
          return fail(`cannot be created (${cur} is a symlink to a path that does not exist)`);
        }
      }
    }
  }

  try {
    rmdirSync(mkdtempSync(join(probeIn, ".corvidinho-doctor-")));
  } catch (e) {
    return fail(exists ? `is not writable (${errCode(e)})` : `cannot be created (${errCode(e)})`);
  }
  return exists
    ? { name: "data-dir", ok: true, detail: `${dir} exists and is writable` }
    : {
        name: "data-dir",
        ok: true,
        mark: "info",
        detail: `${dir} does not exist yet — created on first use (${probeIn} is writable)`,
      };
}

// --- Project files (CLI-4) --------------------------------------------------

type Table = Record<string, unknown>;

function tableOf(v: unknown): Table {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Table) : {};
}

/** Adds `from`'s own keys that `into` does not have yet (first definition wins). */
function mergeMissing(into: Map<string, unknown>, from: unknown): void {
  for (const [k, v] of Object.entries(tableOf(from))) {
    if (!into.has(k)) into.set(k, v);
  }
}

/** A regular file's TOML (a FIFO or device is never opened: it could block doctor). */
function readTomlTable(path: string): Table | null {
  try {
    if (!statSync(path).isFile()) return null;
    return tableOf(Bun.TOML.parse(readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}

/**
 * What `fledge lanes run` loads in `dir`: `fledge.toml`, then any
 * `.fledge/lanes/*.toml` imports in directory order, as fledge reads them
 * (the first definition of a task or lane wins, fledge.toml's first).
 * `broken` names the first file that cannot be read or is not TOML; the
 * parser's message is not kept (it may quote the file).
 */
type FledgeProject =
  | { state: "absent" }
  | { state: "broken"; file: string }
  | { state: "ok"; tasks: Map<string, unknown>; lanes: Map<string, unknown> };

function loadFledgeProject(dir: string): FledgeProject {
  const path = join(dir, "fledge.toml");
  if (!existsSync(path)) return { state: "absent" };
  const main = readTomlTable(path);
  if (!main) return { state: "broken", file: "fledge.toml" };
  const tasks = new Map<string, unknown>();
  const lanes = new Map<string, unknown>();
  mergeMissing(tasks, main.tasks);
  mergeMissing(lanes, main.lanes);
  const importDir = join(dir, ".fledge", "lanes");
  let imports: string[] = [];
  try {
    if (statSync(importDir).isDirectory()) {
      imports = readdirSync(importDir).filter((f) => f.endsWith(".toml"));
    }
  } catch {
    // No imported lanes.
  }
  for (const f of imports) {
    const imported = readTomlTable(join(importDir, f));
    if (!imported) return { state: "broken", file: `.fledge/lanes/${f}` };
    mergeMissing(tasks, imported.tasks);
    mergeMissing(lanes, imported.lanes);
  }
  return { state: "ok", tasks, lanes };
}

/** The fledge task that runs SpecSync on the verify lane (Merlin pattern; SPECSYNC-2/7). */
const SPEC_CHECK_TASK = "spec-check";

/** A shell command line that runs `specsync check` (bare, by path or quoted). */
function runsSpecsyncCheck(cmd: unknown): boolean {
  return typeof cmd === "string" && /(?:^|[\s;&|(/"'`])specsync\s+check(?![\w-])/.test(cmd);
}

/**
 * Task names and inline commands in fledge lane steps: `"task"`,
 * `{ run = "cmd" }`, `{ task = "task" }` or `{ parallel = ["task" | { run }] }`.
 */
function laneStepParts(steps: unknown): { tasks: string[]; cmds: string[] } {
  const out = { tasks: [] as string[], cmds: [] as string[] };
  const one = (step: unknown, inParallel: boolean): void => {
    if (typeof step === "string") {
      out.tasks.push(step);
      return;
    }
    const s = tableOf(step);
    if (typeof s.run === "string") out.cmds.push(s.run);
    else if (inParallel) return;
    else if (typeof s.task === "string") out.tasks.push(s.task);
    else if (Array.isArray(s.parallel)) for (const p of s.parallel) one(p, true);
  };
  if (Array.isArray(steps)) for (const s of steps) one(s, false);
  return out;
}

/**
 * True when running `name` (fledge runs a task's `deps` first) runs
 * spec-check: the defined `spec-check` task, or a task whose `cmd` runs
 * `specsync check`.
 */
function taskRunsSpecCheck(
  name: string,
  tasks: Map<string, unknown>,
  seen = new Set<string>(),
): boolean {
  if (seen.has(name) || !tasks.has(name)) return false;
  seen.add(name);
  const task = tasks.get(name);
  if (name === SPEC_CHECK_TASK) return true;
  if (runsSpecsyncCheck(typeof task === "string" ? task : tableOf(task).cmd)) return true;
  const deps = tableOf(task).deps;
  return (
    Array.isArray(deps) &&
    deps.some((d) => typeof d === "string" && taskRunsSpecCheck(d, tasks, seen))
  );
}

/**
 * Task names the lane steps reach (with their `deps`, which fledge runs
 * first) that no `[tasks]` table defines, in order, each once. Fledge
 * refuses a lane naming one and fails the step whose deps name one.
 */
function undefinedLaneTasks(steps: string[], tasks: Map<string, unknown>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (name: string): void => {
    if (seen.has(name)) return;
    seen.add(name);
    if (!tasks.has(name)) {
      out.push(name);
      return;
    }
    const deps = tableOf(tasks.get(name)).deps;
    if (Array.isArray(deps)) for (const d of deps) if (typeof d === "string") walk(d);
  };
  for (const s of steps) walk(s);
  return out;
}

/** A task name from the project's file, safe to print on one line. */
function printableName(name: string): string {
  const clean = name.replace(/[^\x20-\x7e]/g, "?");
  return `\`${clean.length > 60 ? `${clean.slice(0, 60)}…` : clean}\``;
}

/**
 * The git project root above `dir` when `dir` is a subdirectory of one
 * (`task run` in a subdirectory runs its verify lane there, where fledge
 * finds no fledge.toml); null otherwise.
 */
function projectRootAbove(dir: string): string | null {
  const root = findProjectRoot(dir);
  return root !== dir ? root : null;
}

/** The fix for a project item missing from `dir` that `rootAbove` holds. */
function runFromRootHint(rootAbove: string): string {
  return `${rootAbove} (the project root) has it — run corvidinho there`;
}

function fledgeTomlCheck(
  dir: string,
  project: FledgeProject,
  rootAbove: string | null,
): DoctorCheck {
  const name = "fledge.toml";
  if (project.state === "absent") {
    const fix =
      rootAbove && existsSync(join(rootAbove, "fledge.toml"))
        ? runFromRootHint(rootAbove)
        : "`fledge run --init` creates one";
    return {
      name,
      ok: false,
      detail: `not found in ${dir} — task run's verify gate (\`fledge lanes run verify\`) needs it; ${fix}`,
    };
  }
  if (project.state === "broken" && project.file === "fledge.toml") {
    return {
      name,
      ok: false,
      detail: `${join(dir, "fledge.toml")} cannot be read or is not valid TOML — fledge cannot run its tasks or lanes`,
    };
  }
  return { name, ok: true, detail: `found in ${dir}` };
}

function verifyLaneCheck(project: FledgeProject): DoctorCheck {
  const name = "verify-lane";
  const fail = (detail: string): DoctorCheck => ({ name, ok: false, detail });
  if (project.state === "absent") {
    return fail("no verify lane — there is no fledge.toml to hold [lanes.verify]");
  }
  if (project.state === "broken") {
    return fail(`${project.file} cannot be read or is not valid TOML — fledge cannot load the verify lane`);
  }
  if (!project.lanes.has("verify")) {
    return fail(
      "fledge.toml has no [lanes.verify] — task run's verify gate (`fledge lanes run verify`) fails without it",
    );
  }
  const { tasks, cmds } = laneStepParts(tableOf(project.lanes.get("verify")).steps);
  const undefinedTasks = undefinedLaneTasks(tasks, project.tasks);
  if (undefinedTasks.includes(SPEC_CHECK_TASK)) {
    return fail(
      "[lanes.verify] runs the spec-check task but fledge.toml defines no [tasks.spec-check] — the lane fails on it",
    );
  }
  if (undefinedTasks.length > 0) {
    const shown = undefinedTasks.slice(0, 3).map(printableName).join(", ");
    const more = undefinedTasks.length > 3 ? ` and ${undefinedTasks.length - 3} more` : "";
    return fail(
      `[lanes.verify] needs task ${shown}${more}, which fledge.toml does not define — the lane fails on it every run`,
    );
  }
  if (cmds.some(runsSpecsyncCheck) || tasks.some((t) => taskRunsSpecCheck(t, project.tasks))) {
    return { name, ok: true, detail: "[lanes.verify] runs spec-check" };
  }
  return fail(
    "[lanes.verify] has no spec-check step — task run would call work done without checking specs (AGENT-4 / SPECSYNC-2); add a spec-check task that runs `specsync check` to its steps",
  );
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * A project directory the SpecSync tools read (`.specsync/`, `specs/`); the
 * check is named after it. `why` says what fails without it, `create` the
 * command that creates it (or, from a subdirectory, the project root that
 * holds it).
 */
function projectDirCheck(
  dir: string,
  rootAbove: string | null,
  check: { name: ".specsync" | "specs"; why: string; create: string },
): DoctorCheck {
  const { name, why } = check;
  const path = join(dir, name);
  const fail = (detail: string): DoctorCheck => ({ name, ok: false, detail });
  const fix =
    rootAbove && isDirectory(join(rootAbove, name)) ? runFromRootHint(rootAbove) : check.create;
  const missing = `${why}; ${fix}`;
  try {
    if (!statSync(path).isDirectory()) return fail(`${path} is not a directory — ${missing}`);
  } catch (e) {
    return fail(
      isMissing(e) ? `not found in ${dir} — ${missing}` : `${path} cannot be read (${errCode(e)}) — ${missing}`,
    );
  }
  return { name, ok: true, detail: `found in ${dir}` };
}

/**
 * AGENT-14 (REQ-cli-085): `[warn] verify-gate` when the project's
 * `fledge.toml` still sets a removed verify switch; the key is ignored and
 * verification still runs. Null when none is set. Never fails doctor.
 */
export function removedVerifyKeyDoctorCheck(cwd: string = process.cwd()): DoctorCheck | null {
  const keys = removedVerifyKeys(resolve(cwd));
  if (keys.length === 0) return null;
  return {
    name: "verify-gate",
    ok: true,
    mark: "warn",
    detail: `fledge.toml [corvidinho] ${keys.join(", ")} is ignored — verification can't be turned off (AGENT-14); remove the key`,
  };
}

/**
 * CLI-4 — the project files `task run`'s prove-before-done gate reads in
 * `cwd` (AGENT-4 / SPECSYNC-2), one line each: `fledge.toml`, its verify
 * lane with a spec-check step (`verify-lane`), `.specsync/` and `specs/`.
 * A missing item fails (`[missing]`) and is named in plain language with
 * what fails without it and, where Fledge / SpecSync has one, the command
 * that creates it — or, in a subdirectory of a git project whose root has
 * the item, that root to run from. Shared by `doctor` and the report-only
 * `init`; reads only, creates nothing, never prints file contents.
 */
export function projectFilesDoctorChecks(cwd: string = process.cwd()): DoctorCheck[] {
  const dir = resolve(cwd);
  const fledge = loadFledgeProject(dir);
  const rootAbove = projectRootAbove(dir);
  return [
    fledgeTomlCheck(dir, fledge, rootAbove),
    verifyLaneCheck(fledge),
    projectDirCheck(dir, rootAbove, {
      name: ".specsync",
      why: "SpecSync has no project config (.specsync/config.toml) for spec-check",
      create: "`specsync init` creates it",
    }),
    projectDirCheck(dir, rootAbove, {
      name: "specs",
      why: "spec-check has no specs to hold the code to",
      create: "`specsync generate` scaffolds them",
    }),
  ];
}

// --- Nightly backup (OPS-1/2) -------------------------------------------------

function utcMinute(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Nearest existing directory at or above `dir`, or null. */
function nearestExistingDir(dir: string): string | null {
  for (let cur = dir; ; ) {
    try {
      if (statSync(cur).isDirectory()) return cur;
      return null;
    } catch (e) {
      if (!isMissing(e)) return null;
    }
    const parent = dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

/**
 * OPS-1/2 (#68): where the nightly backup goes, or that there is none.
 * `CORVIDINHO_BACKUP_DIR` unset ⇒ `[warn]` off. A relative path, a directory
 * inside a git work tree, a path that is not a directory or cannot be
 * written ⇒ `[warn]` with the reason. Otherwise `[ok]` with the snapshot
 * count and newest and the last backup / restore test from the shared DB; a
 * failing backup or restore test is `[warn]` with its stored (scrubbed)
 * reason and whether the owner has been told. The backup is optional: this
 * line never fails doctor, so it never blocks a box update's restart
 * (docs/BOX-UPDATE.md). Creates nothing.
 */
export function backupDoctorCheck(
  env: NodeJS.ProcessEnv = process.env,
  opts: { db?: Database } = {},
): DoctorCheck {
  const name = "backup";
  const cfg = resolveBackupConfig(env);
  if (cfg.kind === "off") {
    return {
      name,
      ok: true,
      mark: "warn",
      detail: `off — ${BACKUP_DIR_ENV} is not set, so there is no nightly backup (OPS-1); set it to an absolute local directory outside any git repo`,
    };
  }
  // Warn, never fail: the bridge and daemon run fine without a backup.
  const fail = (detail: string): DoctorCheck => ({ name, ok: true, mark: "warn", detail });
  if (cfg.kind === "invalid") return fail(`${cfg.error} — no nightly backup until it is fixed`);
  const dir = cfg.dir;
  const refusal = backupDirRefusal(dir);
  if (refusal) return fail(refusal);
  const probeIn = nearestExistingDir(dir);
  if (!probeIn) return fail(`${dir} cannot be created (no existing parent directory)`);
  try {
    rmdirSync(mkdtempSync(join(probeIn, ".corvidinho-doctor-")));
  } catch (e) {
    return fail(
      probeIn === dir
        ? `${dir} is not writable (${errCode(e)})`
        : `${dir} cannot be created (${probeIn} is not writable: ${errCode(e)})`,
    );
  }
  let snapshots: ReturnType<typeof listSnapshots> = [];
  try {
    snapshots = listSnapshots(dir);
  } catch (e) {
    return fail(`${dir} cannot be listed (${errCode(e)})`);
  }
  // History from the shared DB, opened read-only (never created or migrated
  // here); no DB file yet means no history.
  let status: BackupStatus | null = null;
  // OPS-1 "I'm told": a failure notice is posted only to the /announce channel.
  let announceSet = false;
  const readState = (db: Database) => {
    status = readBackupStatus(db);
    announceSet = new AnnounceStore(db).getChannelId() !== null;
  };
  let noDb = false;
  if (opts.db) {
    try {
      readState(opts.db);
    } catch {
      status = null;
    }
  } else if (!existsSync(defaultDbPath({ env }))) {
    noDb = true;
  } else {
    let ro: Database | undefined;
    try {
      ro = new Database(defaultDbPath({ env }), { readonly: true });
      readState(ro);
    } catch {
      status = null;
    } finally {
      try {
        ro?.close();
      } catch {
        // already closed
      }
    }
  }
  const parts = [
    `${dir}${probeIn === dir ? "" : " (created on the first backup)"}`,
    `${snapshots.length} snapshot(s)${snapshots[0] ? `, newest ${snapshots[0].name}` : ""}`,
    `nightly from ${String(BACKUP_HOUR).padStart(2, "0")}:00 local time, keeps ${BACKUP_KEEP}`,
  ];
  if (noDb) {
    parts.push("no backup yet (no corvidinho.db in the data dir yet)");
    return { name, ok: true, detail: parts.join(" — ") };
  }
  // Read into a const: TS does not see the closure assignment above.
  const st = status as BackupStatus | null;
  if (!st) {
    parts.push("backup history unreadable (data dir)");
    return { name, ok: true, mark: "warn", detail: parts.join(" — ") };
  }
  const told = (pending: boolean) =>
    pending
      ? "owner not told yet (needs the Discord bridge with an announcements channel set)"
      : "owner told";
  let ok = true;
  const b = st.backup;
  if (b.failingSince !== null) {
    ok = false;
    parts.push(
      `last backup FAILED (failing since ${utcMinute(b.failingSince)}): ${b.lastError ?? "no reason recorded"}; ${told(b.noticePending)}`,
    );
  } else {
    parts.push(b.lastOkAt !== null ? `last backup ok ${utcMinute(b.lastOkAt)}` : "no backup yet");
  }
  const t = st.restoreTest;
  if (t.failingSince !== null) {
    ok = false;
    parts.push(
      `restore test FAILED (failing since ${utcMinute(t.failingSince)}): ${t.lastError ?? "no reason recorded"}; ${told(t.noticePending)}`,
    );
  } else {
    parts.push(t.lastOkAt !== null ? `restore test ok ${utcMinute(t.lastOkAt)}` : "no restore test yet");
  }
  if (!announceSet) {
    ok = false;
    parts.push(
      "no /announce channel set, so a failed backup or restore test is not posted to the owner (set one with `/announce channel`)",
    );
  }
  return ok ? { name, ok: true, detail: parts.join(" — ") } : fail(parts.join(" — "));
}

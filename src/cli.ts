#!/usr/bin/env bun
/**
 * Corvidinho — Bun/TS CLI (Linux).
 * Surfaces: help, version, doctor, init (report only), plugins list/run, specsync *,
 * task run (prove-before-done), backup list/restore (OPS-1/2).
 * Secrets stay out of the repo and out of logs (SAFE-6).
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  createNdjsonWriter,
  createTaskExecute,
  loadAgentConfig,
  parseCapabilityTier,
  runTask,
  TASK_OUTPUT_MODES,
  type AgentEvent,
  type CapabilityTier,
  type SpendWarning,
  type TaskOutputMode,
  type TaskResult,
} from "./agent/index.ts";
import { loadLlmEnv } from "./agent/execute.ts";
import type { InjectionNotice } from "./agent/untrusted.ts";
import { startWorkspaceDiff } from "./agent/workspace-diff.ts";
import { delegateDepthFromEnv } from "./autonomous/delegate.ts";
import { SPAWN_BUN_CONFIG } from "./agent/spawn-argv.ts";
import { spendDoctorCheck } from "./agent/spend.ts";
import { attribution } from "./attribution.ts";
import {
  CORVIDINHO_PROTOCOL_VERSION,
  formatRegisterCommandsFailure,
  goLiveChecklist,
  registerSlashCommandsLive,
  startBridge,
} from "./discord/index.ts";
import { boundPrivateReplies } from "./discord/private-reply.ts";
import {
  goLiveChecklist as watchGoLiveChecklist,
  startWatchPoller,
} from "./watch/index.ts";
import { runDaemon } from "./daemon/index.ts";
import {
  backupDoctorCheck,
  dataDirDoctorCheck,
  discordDoctorCheck,
  githubWatchDoctorCheck,
  llmDoctorCheck,
  loadDoctorAllowlist,
  peopleGithubDoctorCheck,
  projectFilesDoctorChecks,
  removedVerifyKeyDoctorCheck,
  type DoctorCheck,
} from "./doctor.ts";
import { loadAllowlistFile, resolveAllowlistPath } from "./allowlist/load.ts";
import { formatOwnerDoctorDetail, loadOwnerConfig } from "./identity/owner.ts";
import { loadDeclaredPeople } from "./identity/people.ts";
import { loadBuiltins } from "./plugins/builtins.ts";
import { allowlistFromEnv, isNonInteractive } from "./plugins/env.ts";
import { forwardedSignals } from "./plugins/proc-group.ts";
import { get, list, size } from "./plugins/registry.ts";
import { PluginNotFoundError, runPlugin } from "./plugins/run.ts";
import {
  formatPluginsListText,
  toolSurfaceReport,
  withToolCost,
} from "./plugins/toolCost.ts";
import { fledgeStatusLines, loadFledgePlugins } from "../plugins/fledge/index.ts";
import { loadRunnerPlugins, runnerStatusLines } from "../plugins/runners/index.ts";
import {
  BACKUP_DIR_ENV,
  listSnapshots,
  resolveBackupConfig,
  restoreSnapshot,
} from "./store/backup.ts";
import { DEFAULT_DATA_DIR_REL } from "./store/paths.ts";
import { formatErrorLine } from "./store/scrub.ts";
import { VERSION } from "./version.ts";

export { VERSION };

function printHelp(): void {
  console.log(`corvidinho ${VERSION}

Lean Bun/TS Linux agent CLI.

Usage:
  corvidinho --help                 Show this help
  corvidinho help                   Same as --help
  corvidinho version                Print version
  corvidinho attribution             Print the canonical attribution footer
  corvidinho --protocol-version     Print wire protocol integer (DISCORD-10)
  corvidinho doctor                 Check Discord / GitHub / Fledge / SpecSync / project files / plugins /
                                    LLM key / data dir
  corvidinho init                   Report what this project is missing (LLM key, Fledge, SpecSync, project
                                    files: fledge.toml, verify lane with spec-check, .specsync/, specs/);
                                    report only, creates nothing (CLI-4)
  corvidinho discord bridge         Start HEAR Discord bridge (DISCORD-1/2/3/4/5)
  corvidinho discord register-commands
                                    Full-overwrite slash set (guild PUT + clear globals)
  corvidinho github watch           Start WATCH GitHub mention poll (ALLOW-1; poll-first)
  corvidinho daemon                 Tick schedules headlessly, no Discord needed (CLI-8 / AUTONOMOUS-4;
                                    one per data dir; JSON-line logs; systemd: docs/DAEMON.md)
  corvidinho backup list            List nightly SQLite snapshots in CORVIDINHO_BACKUP_DIR, newest first (OPS-1)
  corvidinho backup restore <snapshot> <target> [--force]
                                    Check a snapshot, then copy it to <target> (OPS-2); refuses a target a
                                    process holds open (stop the bridge / daemon first); --force replaces
                                    an existing target nobody holds
  corvidinho plugins list           List loaded plugin commands (PLUGIN-6)
  corvidinho plugins run <name> [--json] [-- ...args]
                                    Run a typed plugin command (args after -- reach it verbatim)
  corvidinho specsync <list|read|check|brief|coverage|score|change-list|ship-status> [...]
                                    SpecSync agent tools (SPECSYNC-1..6; local binary)
  corvidinho task run [--task TEXT] [--tier read|tool|code] [--max-retries N]
                    [--output text|json|ndjson] [--json]
                                    LLM tool loop (plugins) when key set; prove-before-done verify gate (AGENT-3/4/5):
                                    always on, runs the verify lane when the run's real git diff changed (AGENT-14/15)
                                    --json = --output json (one result); ndjson = live event stream
                                    for bridges, one versioned frame per line (AGENT-8 / CLI-7)
  corvidinho --non-interactive ...  Deny dangerous plugins unless allowlisted (SAFE-1 / CLI-3)
  corvidinho --project <path> ...   Run as if started in <path>, without cd: its fledge.toml, specs
                                    and .env files, as Bun loads them there (CLI-5)

Env / allowlists (ALLOW-4; default-deny, never Merlin BASIC):
  CORVIDINHO_NON_INTERACTIVE / FLEDGE_NON_INTERACTIVE  same as --non-interactive
  CORVIDINHO_ALLOWLIST                                  comma-separated dangerous command names
  CORVIDINHO_ALLOWLIST_FILE                             path to allowlist.toml|json on the bot VM
  CORVIDINHO_GITHUB_ALLOW_REPOS / _ORGS / _USERS        default-deny; deny wins (GITHUB-6)
  CORVIDINHO_GITHUB_DENY_REPOS / _ORGS / _USERS         always refuse these
  CORVIDINHO_DISCORD_ALLOW_CHANNELS                     HEAR channel allowlist; empty = refuse start
  CORVIDINHO_DISCORD_ALLOW_USERS / _ROLES               both empty = anyone in an allowlisted channel;
                                                        once either is set, only those users, role holders and the owner
  CORVIDINHO_DISCORD_DENY_CHANNELS / _ROLES / _USERS    deny overrides
  DISCORD_TOKEN / DISCORD_BOT_TOKEN                     required for discord bridge (never commit)
  DISCORD_CHANNEL_IDS                                   non-empty channel ids (union with allowlist)
  DISCORD_GUILD_ID                                      preferred; guild slash overwrite + clear globals
  GITHUB_TOKEN / GH_TOKEN                               required for github watch + Octokit reads
  CORVIDINHO_WATCH_USERNAME                             GitHub login to listen for (WATCH)
  CORVIDINHO_WATCH_INTERVAL_MS                          poll interval (default 60000, min 30000)
  CORVIDINHO_WATCH_DRY_RUN=1                            echo agent; no spawn
  CORVIDINHO_LLM_API_KEY / OPENAI_API_KEY               enable OpenAI-compatible execute (never commit)
  CORVIDINHO_LLM_BASE_URL / CORVIDINHO_LLM_MODEL        provider endpoint + model
  CORVIDINHO_LLM_TIER=read|tool|code                    capability tier (AGENT-5; default tool)
  CORVIDINHO_LLM_MODEL_READ / _TOOL / _CODE             optional model per tier (AGENT-5; else CORVIDINHO_LLM_MODEL)
  CORVIDINHO_DAILY_SPEND_CAP_USD                        optional USD cap on provider calls per rolling 24h: warn at 80%, stop and ask at 100% (SAFE-8)
  CORVIDINHO_BACKUP_DIR                                 optional absolute local dir for the nightly SQLite backup + weekly restore test (OPS-1/2); unset = no backup
  (AlgoChat / wallet ACT deferred until wallet allowlist exists — WALLET-1..3)

Rules (see AGENTS.md + hi/):
  - HI-first; do not invent ACCESS/bounty/MainNet criteria
  - Secrets stay out of the repo and out of chat logs (SAFE-6)
  - Merge only when SpecSync change + verify are green (GITHUB intent)
  - Real code tasks: prove-before-done via fledge verify incl. spec-check (AGENT-4 / SPECSYNC-2)
  - Prefer SpecSync plugins (list/read/check/brief) over raw shell (SPECSYNC-6)
`);
}

function which(bin: string): string | null {
  return Bun.which(bin) ?? null;
}

function envPresent(name: string): boolean {
  // Blank counts as missing, as the bridge / WATCH / Octokit trim tokens (REQ-cli-003).
  return (process.env[name]?.trim() ?? "").length > 0;
}

/**
 * `--task` always takes the next argv item as the task text, even when it
 * starts with `-`: the bridges pass untrusted Discord / GitHub text there, and
 * a message like `--tier=code` or `--no-verify` must stay task text, never
 * become a flag (AGENT-5 / SAFE-1). `--task=TEXT` may span lines.
 *
 * `--no-verify` was removed (AGENT-14): read as a flag it is returned as
 * `removedFlag`, and `main` refuses the command before anything runs.
 *
 * `--project <path>` / `--project=<path>` (CLI-5) is read only before a `--`
 * separator, so a plugin argument after `--` is never taken. `project` is ""
 * when the flag has no path (a missing value or one starting with `-`).
 *
 * In `plugins run <name>`, the first `--` after the name ends Corvidinho's
 * flags: every later argv item is returned verbatim as `pluginArgs` and
 * never parsed as a global flag, `--json` or help (REQ-cli-186).
 */
export function parseGlobalFlags(args: string[]): {
  rest: string[];
  pluginArgs: string[] | undefined;
  nonInteractiveFlag: boolean;
  json: boolean;
  removedFlag: string | undefined;
  maxRetries: number | undefined;
  taskText: string | undefined;
  tier: CapabilityTier | undefined;
  project: string | undefined;
} {
  const rest: string[] = [];
  let pluginArgs: string[] | undefined;
  let nonInteractiveFlag = false;
  let json = false;
  let removedFlag: string | undefined;
  let maxRetries: number | undefined;
  let taskText: string | undefined;
  let tier: CapabilityTier | undefined;
  let project: string | undefined;
  let afterSeparator = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--" && rest.length >= 3 && rest[0] === "plugins" && rest[1] === "run") {
      pluginArgs = args.slice(i + 1);
      break;
    }
    if (a === "--") afterSeparator = true;
    if (!afterSeparator) {
      if (a === "--project") {
        const next = args[i + 1];
        project = next !== undefined && !next.startsWith("-") ? next : "";
        if (project) i++;
        continue;
      }
      const pf = a.match(/^--project=(.*)$/s);
      if (pf) {
        project = pf[1];
        continue;
      }
    }
    if (a === "--non-interactive") {
      nonInteractiveFlag = true;
      continue;
    }
    if (a === "--json") {
      json = true;
      continue;
    }
    if (a === REMOVED_NO_VERIFY_FLAG) {
      removedFlag = a;
      continue;
    }
    if (a === "--task") {
      if (i + 1 < args.length) {
        taskText = args[i + 1];
        i++;
      }
      continue;
    }
    const tf = a.match(/^--task=(.+)$/s);
    if (tf) {
      taskText = tf[1];
      continue;
    }
    if (a === "--tier") {
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        tier = parseCapabilityTier(next, "tool");
        i++;
      }
      continue;
    }
    const tr = a.match(/^--tier=(.+)$/);
    if (tr) {
      tier = parseCapabilityTier(tr[1], "tool");
      continue;
    }
    if (a === "--max-retries") {
      const next = args[i + 1];
      if (next && /^\d+$/.test(next)) {
        maxRetries = Number.parseInt(next, 10);
        i++;
      }
      continue;
    }
    const mr = a.match(/^--max-retries=(\d+)$/);
    if (mr) {
      maxRetries = Number.parseInt(mr[1], 10);
      continue;
    }
    rest.push(a);
  }
  return { rest, pluginArgs, nonInteractiveFlag, json, removedFlag, maxRetries, taskText, tier, project };
}

/**
 * The environment this process was started with, before Bun added the start
 * directory's `.env*` values (Linux `/proc/self/environ`; Bun never writes
 * there). Null when it cannot be read.
 */
export function readStartEnv(path = "/proc/self/environ"): Record<string, string> | null {
  try {
    const env: Record<string, string> = {};
    for (const entry of readFileSync(path, "utf8").split("\0")) {
      const eq = entry.indexOf("=");
      if (eq <= 0) continue;
      const key = entry.slice(0, eq);
      if (!(key in env)) env[key] = entry.slice(eq + 1);
    }
    return env;
  } catch {
    return null;
  }
}

/**
 * The `.env` flags Bun was started with (`--no-env-file`, `--env-file=<path>`,
 * `--env-file <path>`), in order, so the `--project` probe loads exactly the
 * env files a process started in the project with the same flags would: a
 * process run with `--no-env-file` never loads the project's `.env` either
 * (CLI-5 / REQ-cli-505).
 */
export function envFileFlags(execArgv: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < execArgv.length; i++) {
    const a = execArgv[i];
    if (a === "--no-env-file" || a.startsWith("--env-file=")) {
      out.push(a);
    } else if (a === "--env-file" && i + 1 < execArgv.length) {
      out.push(a, execArgv[i + 1]);
      i++;
    }
  }
  return out;
}

/** Prints the env a Bun process started in its cwd gets (never logged). */
const PROJECT_ENV_PROBE = "process.stdout.write(JSON.stringify(process.env))";
/** Cap on the one-off env probe `--project` runs. */
export const PROJECT_ENV_TIMEOUT_MS = 15_000;

export type EnterProjectResult =
  | { ok: true; dir: string }
  | { ok: false; error: string; hint: string };

/**
 * CLI-5 / REQ-cli-505: make this process run as if it had been started in
 * `path` (the top-level process only; spawns keep `--no-env-file`).
 *
 * The env is what Bun builds for a process started there: Bun's own `.env*`
 * loading (`.env`, `.env.<NODE_ENV>`, `.env.local`, `$VAR` expansion; set
 * variables win; the process's own `--no-env-file` / `--env-file` flags,
 * {@link envFileFlags}) run once in `path` from `startEnv` (default
 * {@link readStartEnv}), so the start directory's `.env*` values do not carry
 * over. The probe pins Bun config to {@link SPAWN_BUN_CONFIG}: the project's
 * `bunfig.toml` is never read. Then `process.chdir(path)`, so every command
 * reads that project's `fledge.toml`, specs and files through `process.cwd()`,
 * and children the CLI starts without an explicit `env` get the new env too
 * ({@link spawnsInheritProcessEnv}). On any failure nothing is changed.
 */
export function enterProject(
  path: string,
  opts: { startEnv?: Record<string, string> | null } = {},
): EnterProjectResult {
  const fail = (error: string, hint: string): EnterProjectResult => ({ ok: false, error, hint });
  const usage = "pass --project the path of an existing project directory";
  if (!path) return fail("--project needs a directory path", usage);
  const dir = resolve(path);
  try {
    if (!statSync(dir).isDirectory()) return fail(`--project ${dir} is not a directory`, usage);
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code;
    return code === "ENOENT" || code === "ENOTDIR"
      ? fail(`--project ${dir} does not exist`, usage)
      : fail(`--project ${dir} cannot be read (${String(code ?? "error")})`, usage);
  }

  const startEnv = opts.startEnv === undefined ? readStartEnv() : opts.startEnv;
  const base: Record<string, string> = {};
  for (const [k, v] of Object.entries(startEnv ?? process.env)) {
    if (typeof v === "string") base[k] = v;
  }
  const envHint = `check that ${dir} can be entered and its .env files read`;
  let env: Record<string, string>;
  try {
    const probe = Bun.spawnSync(
      [
        process.execPath,
        ...envFileFlags(process.execArgv),
        `--config=${SPAWN_BUN_CONFIG}`,
        "-e",
        PROJECT_ENV_PROBE,
      ],
      {
        cwd: dir,
        env: base,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        timeout: PROJECT_ENV_TIMEOUT_MS,
      },
    );
    if (probe.exitCode !== 0) {
      return fail(`--project ${dir}: could not load its .env files (bun exit ${probe.exitCode ?? "signal"})`, envHint);
    }
    const parsed: unknown = JSON.parse(probe.stdout.toString());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    env = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") env[k] = v;
    }
    process.chdir(dir);
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code;
    return fail(
      `--project ${dir}: could not load its .env files${typeof code === "string" ? ` (${code})` : ""}`,
      envHint,
    );
  }
  for (const k of Object.keys(process.env)) {
    if (!(k in env)) delete process.env[k];
  }
  Object.assign(process.env, env);
  spawnsInheritProcessEnv();
  return { ok: true, dir };
}

let spawnEnvFollowsProcessEnv = false;

/**
 * `Bun.spawn` / `Bun.spawnSync` with no `env` pass the environment Bun started
 * with (the start directory's `.env*` values included), not `process.env` as
 * {@link enterProject} rewrote it. Default their `env` to the current
 * `process.env` (what `node:child_process` does), so a child the CLI starts
 * (`specsync`, `fledge run spec-check`, git) gets the project's env, never the
 * start directory's `.env*` values (CLI-5 / REQ-cli-505). Idempotent.
 */
function spawnsInheritProcessEnv(): void {
  if (spawnEnvFollowsProcessEnv) return;
  spawnEnvFollowsProcessEnv = true;
  type SpawnFn = (...args: unknown[]) => unknown;
  const withCurrentEnv =
    (spawn: SpawnFn): SpawnFn =>
    (...args: unknown[]) => {
      // Bun.spawn(argv, opts?) or Bun.spawn({ cmd, ...opts }).
      const i = Array.isArray(args[0]) ? 1 : 0;
      const opts = (args[i] ?? {}) as { env?: unknown };
      if (opts.env === undefined) args[i] = { ...opts, env: { ...process.env } };
      return spawn(...args);
    };
  const bun = Bun as unknown as { spawn: SpawnFn; spawnSync: SpawnFn };
  bun.spawn = withCurrentEnv(bun.spawn);
  bun.spawnSync = withCurrentEnv(bun.spawnSync);
}

/** The verify skip flag that no longer exists (AGENT-14, REQ-cli-085). */
export const REMOVED_NO_VERIFY_FLAG = "--no-verify";

/**
 * A removed flag on the command line (REQ-cli-085): refused before anything
 * runs, never silently ignored, so nobody believes verification was skipped.
 */
export class RemovedFlagError extends Error {
  readonly hint = "run the command without it; the verify gate runs only when the run changed something";
  constructor(flag: string) {
    super(`${flag} was removed: verification can't be skipped (AGENT-14)`);
    this.name = "RemovedFlagError";
  }
}

/** A `--project` path that cannot be used (CLI-5); carries its own hint (REQ-cli-419). */
export class ProjectDirError extends Error {
  constructor(
    message: string,
    readonly hint: string,
  ) {
    super(message);
    this.name = "ProjectDirError";
  }
}

/** `fledge` / `specsync` on PATH (the verify lane needs both). */
function toolOnPathCheck(bin: "fledge" | "specsync"): DoctorCheck {
  const path = which(bin);
  return {
    name: bin,
    ok: Boolean(path),
    detail: path ? `found at ${path}` : `${bin} not on PATH`,
  };
}

/** Prints `  [mark] name: detail` lines; true when no check failed. */
function printChecks(checks: DoctorCheck[]): boolean {
  let allOk = true;
  for (const c of checks) {
    const mark = c.mark ?? (c.ok ? "ok" : "missing");
    console.log(`  [${mark}] ${c.name}: ${c.detail}`);
    if (!c.ok) allOk = false;
  }
  return allOk;
}

async function doctor(): Promise<number> {
  loadBuiltins();
  const checks: DoctorCheck[] = [];

  // CLI-4 / ALLOW-3/4 — channel / repo allowlists through the bridge / WATCH
  // loader (allowlist file + env overlays, deny wins); source named, values not.
  const allow = await loadDoctorAllowlist(process.env);
  const discordCheck = discordDoctorCheck(allow, process.env);
  checks.push(discordCheck);

  const tokenOk = envPresent("GITHUB_TOKEN") || envPresent("GH_TOKEN");
  checks.push({
    name: "github",
    ok: tokenOk,
    detail: tokenOk
      ? "GITHUB_TOKEN/GH_TOKEN present for Octokit (value not shown)"
      : "missing GITHUB_TOKEN or GH_TOKEN for Octokit plugins",
  });

  const watchCheck = githubWatchDoctorCheck(allow, process.env);
  checks.push(watchCheck);

  checks.push(toolOnPathCheck("fledge"));
  checks.push(toolOnPathCheck("specsync"));

  // CLI-4 — the project files task run's verify gate reads in this dir
  // (fledge.toml, verify lane with spec-check, .specsync/, specs/).
  checks.push(...projectFilesDoctorChecks(process.cwd()));
  // AGENT-14 — a removed verify switch is ignored; say so ([warn], never fails).
  const removedKey = removedVerifyKeyDoctorCheck(process.cwd());
  if (removedKey) checks.push(removedKey);

  const pluginCount = size();
  checks.push({
    name: "plugins",
    ok: pluginCount > 0,
    detail: `${pluginCount} command(s) loaded`,
  });

  // ALLOW-4 — an allowlist file that exists but cannot be read or parsed stops
  // the bridge, watch and daemon (fail closed); say so here, with the loader's
  // error (path, line and key — never list values).
  const allowPath = resolveAllowlistPath(process.env);
  if (allowPath && existsSync(allowPath)) {
    const loaded = await loadAllowlistFile(allowPath);
    checks.push({
      name: "allowlist-file",
      ok: loaded.ok,
      mark: loaded.ok ? "ok" : "fail",
      detail: loaded.ok
        ? `${allowPath} loads (values not shown)`
        : `${loaded.error} — bridge, watch and daemon refuse to start and gates refuse until it is fixed`,
    });
  } else {
    checks.push({
      name: "allowlist-file",
      ok: true,
      mark: "info",
      detail: allowPath
        ? `${allowPath} not found — env overlays only`
        : "no allowlist file — env overlays only (CORVIDINHO_ALLOWLIST_FILE or ~/.config/corvidinho/allowlist.toml|json)",
    });
  }

  // IDENTITY-1 — owner yes/no + display only (never ids/logins/tokens).
  // Optional: a missing owner is informational and never fails doctor.
  const ownerLoad = await loadOwnerConfig({ env: process.env });
  checks.push({
    name: "owner",
    ok: true,
    mark: ownerLoad.owner && ownerLoad.issues.length === 0 ? "ok" : "info",
    detail: formatOwnerDoctorDetail(ownerLoad),
  });
  // IDENTITY-7.a — the owner / declared people with a GitHub login but no
  // numeric GitHub id are not recognised on GitHub ([warn], person ids only).
  const peopleCheck = peopleGithubDoctorCheck(
    loadDeclaredPeople({
      allowlist: { sourcePath: allowPath && existsSync(allowPath) ? allowPath : null },
      owner: ownerLoad.owner,
    }),
  );
  if (peopleCheck) checks.push(peopleCheck);
  // IDENTITY-2 — ADMIN is owner-only; legacy admin lists are ignored.
  if (
    (process.env.CORVIDINHO_DISCORD_ADMIN_USERS ?? "").trim() ||
    (process.env.CORVIDINHO_DISCORD_ADMIN_ROLES ?? "").trim()
  ) {
    checks.push({
      name: "admin-lists",
      ok: true,
      mark: "warn",
      detail:
        "CORVIDINHO_DISCORD_ADMIN_USERS/_ROLES are ignored — ADMIN is owner-only (IDENTITY-2)",
    });
  }

  // CLI-4 — task run without a key uses the demo stub (warn, never fails doctor);
  // the bridge, watch, daemon and memory tools need a writable data dir.
  checks.push(llmDoctorCheck(process.env));
  checks.push(dataDirDoctorCheck(process.env));
  // OPS-1/2 — nightly backup dir, snapshots, last backup / restore test
  // ([warn] when off, unusable or failing; never fails doctor).
  checks.push(backupDoctorCheck(process.env));

  // SAFE-8 / AUTONOMOUS-8 — rolling 24 h spend vs the cap (info when no cap; never fails doctor).
  checks.push({ name: "spend", ...spendDoctorCheck({ env: process.env, model: loadLlmEnv().model }) });

  console.log("corvidinho doctor\n");
  const allOk = printChecks(checks);
  console.log("");
  if (allOk) {
    console.log("All checks passed.");
    return 0;
  }
  console.log(
    "One or more checks failed. Install/configure the missing pieces; secrets stay out of the repo.",
  );
  if (!discordCheck.ok) {
    console.log("");
    console.log(goLiveChecklist());
  }
  if (!watchCheck.ok) {
    console.log("");
    console.log(watchGoLiveChecklist());
  }
  return 1;
}

/**
 * `corvidinho init` (CLI-4): report only. Says what this project (the current
 * dir) is missing before `task run` fails on it mid-task — the LLM key task
 * run uses, `fledge` / `specsync` on PATH and the project files (the same
 * lines doctor prints). Creates and changes nothing; exit 1 when an item is
 * missing (a `[warn]` line, such as no LLM key, does not fail).
 */
function init(): number {
  const checks: DoctorCheck[] = [
    llmDoctorCheck(process.env),
    toolOnPathCheck("fledge"),
    toolOnPathCheck("specsync"),
    ...projectFilesDoctorChecks(process.cwd()),
  ];
  console.log("corvidinho init (report only — creates nothing)\n");
  const allOk = printChecks(checks);
  console.log("");
  console.log(
    allOk
      ? "Nothing missing for task run in this project."
      : "Missing items are listed above; init created nothing. Add them, then run init again.",
  );
  console.log("Discord / GitHub keys and allowlists: run `corvidinho doctor`.");
  return allOk ? 0 : 1;
}

const BACKUP_USAGE =
  "usage: corvidinho backup list | corvidinho backup restore <snapshot> <target> [--force]";

/**
 * `corvidinho backup list|restore` (OPS-1/2, #68). `list` prints the
 * snapshots in CORVIDINHO_BACKUP_DIR newest first; `restore` checks a named
 * snapshot and copies it to a target path, refusing a target a process holds
 * open (never the live DB while the bridge / daemon run) and an existing
 * target without --force.
 */
function backupCli(args: string[]): number {
  const sub = args[0];
  const cfg = resolveBackupConfig(process.env);
  if (sub !== "list" && sub !== "restore") {
    console.error(`${BACKUP_USAGE}\n`);
    return 1;
  }
  if (cfg.kind !== "on") {
    console.error(
      cfg.kind === "off"
        ? `${BACKUP_DIR_ENV} is not set — no nightly backup is configured (see \`corvidinho doctor\`)`
        : cfg.error,
    );
    return 1;
  }
  if (sub === "list") {
    const snaps = listSnapshots(cfg.dir);
    if (snaps.length === 0) {
      console.log(`No snapshots in ${cfg.dir} yet.`);
      return 0;
    }
    console.log(`Snapshots in ${cfg.dir} (newest first):`);
    for (const s of snaps) {
      console.log(`  ${s.name}  ${new Date(s.takenAt).toISOString()}  ${s.bytes} bytes`);
    }
    return 0;
  }
  const positional = args.slice(1).filter((a) => a !== "--force");
  if (positional.length !== 2) {
    console.error(`${BACKUP_USAGE}\n`);
    return 1;
  }
  const r = restoreSnapshot({
    dir: cfg.dir,
    name: positional[0]!,
    target: positional[1]!,
    force: args.includes("--force"),
  });
  if (!r.ok) {
    console.error(`restore refused: ${r.error}`);
    return 1;
  }
  const rows = Object.values(r.counts).reduce((a, b) => a + b, 0);
  console.log(
    `Restored ${r.snapshot} to ${r.target} (schema v${r.schemaVersion}, integrity ok, ${Object.keys(r.counts).length} tables, ${rows} rows).`,
  );
  return 0;
}

async function pluginsList(json: boolean): Promise<number> {
  loadBuiltins();
  // PLUGIN-4: which language runners loaded, and why any did not (idempotent).
  const runners = loadRunnerPlugins();
  // FLEDGE-4 / PLUGIN-3: project Fledge plugins; failure degrades to builtins only.
  const fledge = await loadFledgePlugins({ cwd: process.cwd() });
  const entries = withToolCost(list());
  if (json) {
    console.log(JSON.stringify(entries, null, 2));
  } else {
    // PLUGIN-6 / FLEDGE-5: per-command schema cost + tool-surface budget.
    console.log(
      formatPluginsListText(entries, toolSurfaceReport(entries), [
        ...runnerStatusLines(runners),
        ...fledgeStatusLines(fledge),
      ]),
    );
  }
  return 0;
}

async function pluginsRun(
  name: string | undefined,
  passArgs: string[],
  opts: { json: boolean; nonInteractive: boolean },
): Promise<number> {
  loadBuiltins();
  if (!name) {
    console.error("usage: corvidinho plugins run <name> [--json] [-- ...args]");
    return 1;
  }
  if (name.startsWith("fledge-") && !get(name)) {
    await loadFledgePlugins({ cwd: process.cwd() });
  }
  let result: Awaited<ReturnType<typeof runPlugin>>;
  try {
    result = await runPlugin({
      name,
      args: passArgs,
      json: opts.json,
      nonInteractive: opts.nonInteractive,
      allowlist: allowlistFromEnv(),
      cwd: process.cwd(),
    });
  } catch (err) {
    // REQ-cli-419: an unknown name or a throwing handler is one clean line.
    return reportCliError(err, { json: opts.json });
  }
  if (!result.ok) {
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, error: result.error, data: result.data }, null, 2));
    } else {
      console.error(result.error ?? "plugin failed");
    }
    return result.exitCode ?? 1;
  }
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, data: result.data }, null, 2));
  } else if (result.message) {
    console.log(result.message);
  } else if (result.data !== undefined) {
    console.log(typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2));
  }
  return result.exitCode ?? 0;
}

const TASK_RUN_USAGE =
  "usage: corvidinho task run [--task TEXT] [--tier read|tool|code] [--max-retries N] [--output text|json|ndjson] [--json]";

/**
 * `--output text|json|ndjson` for `task run` (CLI-7). Parsed only here so a
 * plugin's own `--output` after `--` is never taken. `--json` = `--output json`;
 * an explicit `--output` wins. Returns null for a missing or unknown value.
 */
export function parseTaskOutputMode(
  args: string[],
  json: boolean,
): TaskOutputMode | null {
  let value: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--output") {
      const next = args[i + 1];
      value = next && !next.startsWith("-") ? next : "";
      if (value) i++;
      continue;
    }
    const m = a.match(/^--output=(.*)$/);
    if (m) value = m[1];
  }
  if (value === undefined) return json ? "json" : "text";
  const mode = value.trim().toLowerCase();
  return (TASK_OUTPUT_MODES as readonly string[]).includes(mode)
    ? (mode as TaskOutputMode)
    : null;
}

/**
 * One task through the prove-before-done loop (demo stub without an LLM
 * key). The verify gate is always on (AGENT-14, REQ-cli-085): Discord, WATCH,
 * schedules, /work, delegate workers and this CLI all reach it here.
 * `ndjson` streams one frame per line (REQ-cli-073 / REQ-agent-073).
 */
async function taskRun(opts: {
  output: TaskOutputMode;
  maxRetries: number | undefined;
  taskText: string | undefined;
  tier: CapabilityTier | undefined;
  nonInteractive: boolean;
}): Promise<number> {
  const cwd = process.cwd();
  const config = loadAgentConfig(cwd);
  const events: AgentEvent[] = [];
  const json = opts.output === "json";
  // Machine modes keep stderr quiet; ndjson writes each frame as it happens.
  const quiet = opts.output !== "text";
  const ndjson =
    opts.output === "ndjson"
      ? createNdjsonWriter((line) => console.log(line))
      : null;
  const handleEvent = (e: AgentEvent) => {
    events.push(e);
    ndjson?.event(e);
    if (quiet) return;
    if (e.type === "StateChanged") {
      console.error(`→ ${e.state}`);
    } else if (e.type === "Text") {
      console.error(e.text);
    } else if (e.type === "ToolCall") {
      console.error(`▸ ${e.name} ${e.args.slice(0, 200)}`);
    } else if (e.type === "ToolResult") {
      console.error(
        `${e.name} → ${e.success ? "ok" : "fail"}${e.detail ? `: ${e.detail.slice(0, 120)}` : ""}`,
      );
    } else if (e.type === "VerifyResult") {
      console.error(`verify: ${e.success ? "pass" : "fail"}`);
    }
  };
  const execute = createTaskExecute({
    taskText: opts.taskText,
    cwd,
    tier: opts.tier,
    nonInteractive: opts.nonInteractive,
    allowlist: allowlistFromEnv(),
    onEvent: handleEvent,
    onUsage: ndjson ? (u) => ndjson.usage(u) : undefined,
    // SAFE-8: the 80% warning rides the result (--json / ndjson) for bridges.
    onSpendWarning: (w) => {
      spendWarning = w;
    },
    // SAFE-13: a tool result that looked like an injection rides the result
    // too, so the bridge tells the owner.
    onInjection: (n) => {
      injection = n;
    },
    // MEMORY-7.a (REQ-cli-710): text shown only privately rides the result
    // (--json / ndjson) for the bridge to send by direct message; the model
    // never saw it. A retried attempt's repeat read is kept once; the list is
    // bounded (boundPrivateReplies) when the result is built.
    onPrivateReply: (text) => {
      if (!privateReplies.includes(text)) privateReplies.push(text);
    },
  });
  let spendWarning: SpendWarning | undefined;
  let injection: InjectionNotice | undefined;
  const privateReplies: string[] = [];
  // AGENT-3 (REQ-cli-244): SIGINT / SIGTERM abort the run so the verify lane
  // and tool loop stop and the cancelled result below is still printed (exit
  // 130). `once`: a second signal takes the default action. A signal this
  // process started with ignored (a background job's SIGINT) is not hooked:
  // a listener would replace SIG_IGN and removing it restores SIG_DFL.
  const abort = new AbortController();
  const onSignal = () => abort.abort();
  const hooked = forwardedSignals().filter(
    (sig) => sig === "SIGINT" || sig === "SIGTERM",
  );
  for (const sig of hooked) process.once(sig, onSignal);
  let result: TaskResult;
  try {
    result = await runTask({
      cwd,
      task: opts.taskText,
      config,
      maxRetries: opts.maxRetries,
      // REQ-agent-015: a delegate or council worker runs in its lead's talk
      // worktree and leaves the verified marker to the lead's gate.
      ...(delegateDepthFromEnv() > 0
        ? { workspaceDiff: (dir: string) => startWorkspaceDiff(dir, {}, { nested: true }) }
        : {}),
      signal: abort.signal,
      onEvent: handleEvent,
      execute: async (ctx) => {
        if (ctx.verifyFeedback && !quiet) {
          console.error(`(attempt ${ctx.attempt}) feedback:\n${ctx.verifyFeedback.slice(0, 500)}`);
        }
        return execute(ctx);
      },
    });
  } finally {
    for (const sig of hooked) process.off(sig, onSignal);
  }
  if (spendWarning) result.spendWarning = spendWarning;
  if (injection) result.injection = injection;
  // Bounded (count, scrubbed then cut with a marker, REQ-cli-710) so a run of
  // large private reads cannot push the result frame past the parser's line
  // cap and lose the whole answer.
  if (privateReplies.length > 0) result.privateReplies = boundPrivateReplies(privateReplies);

  if (ndjson) {
    ndjson.result(result);
  } else if (json) {
    console.log(JSON.stringify({ result, events }, null, 2));
  } else {
    console.log(
      `state=${result.state} verified=${result.verified} verifySkipped=${result.verifySkipped} cancelled=${result.cancelled} attempts=${result.attempts}`,
    );
    console.log(result.summary);
    // SAFE-8: a spend-cap summary is generic; the operator details are in the ask.
    if (result.ask && !result.summary.includes(result.ask.question)) {
      console.log(result.ask.question);
    }
  }

  if (result.cancelled) return 130;
  if (result.state === "failed" || (result.verified === false && !result.verifySkipped)) {
    return 1;
  }
  return 0;
}


async function specsyncCli(
  sub: string | undefined,
  args: string[],
  opts: { json: boolean; nonInteractive: boolean },
): Promise<number> {
  const map: Record<string, string> = {
    list: "specsync-list",
    read: "specsync-read",
    check: "specsync-check",
    brief: "specsync-brief",
    coverage: "specsync-coverage",
    score: "specsync-score",
    "change-list": "specsync-change-list",
    "ship-status": "specsync-ship-status",
  };
  if (!sub || !(sub in map)) {
    console.error(
      "usage: corvidinho specsync <list|read|check|brief|coverage|score|change-list|ship-status> [...]",
    );
    return 1;
  }
  return pluginsRun(map[sub], args, opts);
}



async function discordRegisterCommands(argv: string[]): Promise<number> {
  let guildId = process.env.DISCORD_GUILD_ID?.trim() || undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--guild-id") {
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        guildId = next.trim();
        i++;
      }
      continue;
    }
    const m = a.match(/^--guild-id=(.+)$/);
    if (m) {
      guildId = m[1].trim();
    }
  }

  const token =
    process.env.DISCORD_BOT_TOKEN?.trim() ||
    process.env.DISCORD_TOKEN?.trim() ||
    "";
  if (!token) {
    console.error(
      "missing DISCORD_TOKEN or DISCORD_BOT_TOKEN — set the bot token in the VM env/secret store (never commit).",
    );
    console.error(goLiveChecklist());
    return 1;
  }

  // Application id = base64 of first JWT segment of bot token (no secret echo).
  let applicationId: string;
  try {
    const part = token.split(".")[0] ?? "";
    const pad = "=".repeat((4 - (part.length % 4)) % 4);
    applicationId = Buffer.from(part + pad, "base64").toString("utf8");
    if (!/^\d+$/.test(applicationId)) {
      throw new Error("application id decode failed");
    }
  } catch {
    console.error(
      "could not derive application id from bot token; check DISCORD_TOKEN / DISCORD_BOT_TOKEN",
    );
    return 1;
  }

  try {
    const result = await registerSlashCommandsLive({
      token,
      applicationId,
      guildId,
    });
    if (result.scope === "guild") {
      console.log(
        `[discord] registered ${result.registeredCount} guild slash command(s) on ${result.guildId} (globals cleared)`,
      );
    } else {
      console.log(
        `[discord] registered ${result.registeredCount} global slash command(s)`,
      );
      if (result.warnNoGuildId) {
        console.warn(`[discord] ${result.warnNoGuildId}`);
      }
    }
    return 0;
  } catch (err) {
    // REQ-cli-419: one scrubbed line, never the raw DiscordAPIError dump.
    console.error(formatRegisterCommandsFailure(err));
    return 1;
  }
}

async function discordBridge(): Promise<number> {
  const result = await startBridge({ projectRoot: process.cwd() });
  if (!result.ok) {
    console.error(result.message);
    return result.exitCode;
  }
  // Keep process alive until signal.
  await new Promise<void>((resolve) => {
    const stop = async () => {
      console.log("[discord] shutting down...");
      await result.stop();
      resolve();
    };
    process.once("SIGINT", () => {
      void stop();
    });
    process.once("SIGTERM", () => {
      void stop();
    });
  });
  return 0;
}

async function githubWatch(): Promise<number> {
  const result = await startWatchPoller({ projectRoot: process.cwd() });
  if (!result.ok) {
    console.error(result.message);
    return result.exitCode;
  }
  console.log(
    `[watch] poll-first started for @${result.config.mentionUsername} on ${result.config.repos.join(", ")} every ${result.config.intervalMs}ms` +
      (result.config.dryRun ? " (dry-run)" : ""),
  );
  return new Promise<number>((resolve) => {
    const stop = async () => {
      console.log("[watch] shutting down...");
      await result.stop();
      resolve(0);
    };
    process.once("SIGINT", () => {
      void stop();
    });
    process.once("SIGTERM", () => {
      void stop();
    });
    // REQ-cli-419: a rejected token (401) stops the poller; exit non-zero.
    void result.fatal.then(async (f) => {
      try {
        await result.stop();
      } catch {
        // The poll loop already stopped; a failed DB close must not hang or
        // crash the exit (the fatal line was printed by the poller).
      } finally {
        resolve(f.exitCode);
      }
    });
  });
}

export async function main(argv: string[]): Promise<number> {
  const raw = argv.slice(2);
  const {
    rest,
    pluginArgs,
    nonInteractiveFlag,
    json: globalJson,
    removedFlag,
    maxRetries,
    taskText,
    tier,
    project,
  } = parseGlobalFlags(raw);
  // AGENT-14 (REQ-cli-085): verification can't be skipped; a removed skip
  // flag stops the command before anything runs.
  if (removedFlag) {
    return reportCliError(new RemovedFlagError(removedFlag), { json: wantsJson(raw) });
  }
  // CLI-5: enter the project before anything reads the cwd or the env.
  if (project !== undefined) {
    const entered = enterProject(project);
    if (!entered.ok) {
      return reportCliError(new ProjectDirError(entered.error, entered.hint), {
        json: wantsJson(raw),
      });
    }
  }
  const nonInteractive = isNonInteractive({ nonInteractiveFlag });

  // `rest` excludes the `--task` value and plugin args after `--`, so help
  // text there is data, not a request for help (REQ-cli-143 / REQ-cli-186).
  if (
    rest.length === 0 ||
    rest.includes("--help") ||
    rest.includes("-h") ||
    rest[0] === "help"
  ) {
    printHelp();
    return 0;
  }

  const cmd = rest[0];
  if (cmd === "version" || cmd === "--version" || cmd === "-V") {
    console.log(VERSION);
    return 0;
  }
  if (cmd === "attribution") {
    console.log(attribution());
    return 0;
  }
  if (cmd === "--protocol-version") {
    console.log(String(CORVIDINHO_PROTOCOL_VERSION));
    return 0;
  }
  if (cmd === "doctor") {
    return doctor();
  }
  if (cmd === "init") {
    return init();
  }
  if (cmd === "discord") {
    const sub = rest[1];
    if (sub === "bridge") {
      return discordBridge();
    }
    if (sub === "register-commands") {
      return discordRegisterCommands(rest.slice(2));
    }
    console.error(
      "usage: corvidinho discord <bridge|register-commands> [--guild-id ID]\n",
    );
    printHelp();
    return 1;
  }
  if (cmd === "github") {
    const sub = rest[1];
    if (sub === "watch") {
      return githubWatch();
    }
    console.error("usage: corvidinho github watch\n");
    printHelp();
    return 1;
  }
  if (cmd === "backup") {
    return backupCli(rest.slice(1));
  }
  if (cmd === "daemon") {
    // CLI-8 / AUTONOMOUS-4: headless schedule ticker (src/daemon/).
    return runDaemon({ projectRoot: process.cwd() });
  }
  if (cmd === "plugins") {
    const sub = rest[1];
    if (sub === "list") {
      return pluginsList(globalJson || rest.includes("--json"));
    }
    if (sub === "run") {
      return pluginsRun(rest[2], pluginArgs ?? rest.slice(3), {
        json: globalJson,
        nonInteractive,
      });
    }
    console.error("usage: corvidinho plugins <list|run> ...\n");
    printHelp();
    return 1;
  }
  if (cmd === "specsync") {
    return specsyncCli(rest[1], rest.slice(2), {
      json: globalJson || rest.includes("--json"),
      nonInteractive,
    });
  }
  if (cmd === "task") {
    const sub = rest[1];
    if (sub === "run") {
      const output = parseTaskOutputMode(
        rest.slice(2),
        globalJson || rest.includes("--json"),
      );
      if (!output) {
        console.error(`${TASK_RUN_USAGE}\n`);
        return 1;
      }
      return taskRun({
        output,
        maxRetries,
        taskText,
        tier,
        nonInteractive,
      });
    }
    console.error(`${TASK_RUN_USAGE}\n`);
    printHelp();
    return 1;
  }

  console.error(`Unknown command: ${cmd}\n`);
  printHelp();
  return 1;
}

/** One next step for the operator, matched to the error kind (CLI-4). */
export function cliErrorHint(err: unknown): string {
  if (err instanceof PluginNotFoundError) {
    return "run `corvidinho plugins list` for the available commands";
  }
  if (err instanceof ProjectDirError || err instanceof RemovedFlagError) return err.hint;
  const e = err as { code?: unknown; path?: unknown } | null;
  const code = e && typeof e === "object" && typeof e.code === "string" ? e.code : "";
  if (
    (/^E[A-Z]+$/.test(code) && typeof e?.path === "string") ||
    // The data dir exists but the DB in it cannot be opened (bun:sqlite).
    /^SQLITE_(CANTOPEN|READONLY|PERM|NOTADB)$/.test(code)
  ) {
    return `check that the path exists and is writable; the data dir is CORVIDINHO_DATA_DIR (default ~/${DEFAULT_DATA_DIR_REL})`;
  }
  return "run `corvidinho doctor` to check the environment";
}

function cliExitCode(err: unknown): number {
  const c = (err as { exitCode?: unknown } | null)?.exitCode;
  return typeof c === "number" && Number.isInteger(c) && c >= 1 && c <= 255 ? c : 1;
}

/**
 * REQ-cli-419 (CLI-4 / CLI-7 / SAFE-6): report a failed command as one
 * scrubbed line plus a hint, never a stack or a library dump. Text mode:
 * `corvidinho: <line>` then `hint: …` on stderr. `--json`: `{ ok: false,
 * error }` on stdout (the `plugins run --json` error shape), hint on stderr.
 * Returns the error's own `exitCode` (1–255) or 1.
 */
export function reportCliError(err: unknown, opts: { json?: boolean } = {}): number {
  const line = formatErrorLine(err);
  if (opts.json) {
    console.log(JSON.stringify({ ok: false, error: line }, null, 2));
  } else {
    console.error(`corvidinho: ${line}`);
  }
  console.error(`hint: ${cliErrorHint(err)}`);
  return cliExitCode(err);
}

/** True when argv asks for a single JSON result (`--json` / `--output json`). */
function wantsJson(args: string[]): boolean {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") break;
    if (a === "--json" || a === "--output=json") return true;
    if (a === "--output" && args[i + 1] === "json") return true;
  }
  return false;
}

/**
 * Top-level CLI error boundary (REQ-cli-419): runs `main` and turns anything
 * it throws into {@link reportCliError} output and a non-zero exit code, so
 * no command ends in a stack trace or Bun's crash footer.
 */
export async function runCli(
  argv: string[],
  run: (argv: string[]) => Promise<number> = main,
): Promise<number> {
  try {
    return await run(argv);
  } catch (err) {
    return reportCliError(err, { json: wantsJson(argv.slice(2)) });
  }
}

if (import.meta.main) {
  const code = await runCli(process.argv);
  process.exit(code);
}

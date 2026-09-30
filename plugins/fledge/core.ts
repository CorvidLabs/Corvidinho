/**
 * Fledge itself as typed builtins (PLUGIN-1 / PLUGIN-2).
 *
 * PLUGIN-1 lists "Fledge itself" next to files, shell, git and the rest. The
 * bridge in index.ts / commands.ts covers the project's Fledge *plugins*
 * (`fledge-<command>`, PLUGIN-3); these four commands wrap fledge's own
 * commands, run by the local fledge CLI in the plugin cwd (project root /
 * task worktree):
 *
 * - `fledge-lanes-list`          → `fledge --non-interactive lanes list --json`
 * - `fledge-lanes-validate`      → `fledge --non-interactive lanes validate --json [--strict]`
 * - `fledge-lanes-run <lane>`    → `fledge --non-interactive lanes run <lane>`
 * - `fledge-run <task> [args…]`  → `fledge --non-interactive run <task> [-- args…]`
 *
 * Danger (PLUGIN-2 / SAFE-1): listing and validating lanes only read the
 * project's lane sources (fledge.toml and `.fledge/lanes/*.toml`) →
 * `dangerous: false`, minTier 0. Running a lane or a
 * task runs the project's own commands with the operator's privileges →
 * `dangerous: true`, minTier 2 (code), like `shell-exec` and the language
 * runners: denied non-interactively unless allowlisted, audited, never
 * offered to non-ADMIN role sessions.
 *
 * argv: a lane or task name must match {@link FLEDGE_NAME_RE} (no leading
 * `-`), so model argv never becomes a fledge option (`--init` would write
 * fledge.toml, a SAFE-2 protected file; a validate PATH would read another
 * directory). Task args go after fledge's `--` verbatim (fledge appends them
 * to the task's command and never splices them into its string).
 *
 * Lane sources (read-only commands): fledge prints the offending line of a
 * lane source it cannot parse. Before `fledge-lanes-list` or
 * `fledge-lanes-validate` starts fledge, each lane source that exists must
 * resolve (symlinks followed) to a regular file inside the real project root
 * (`.fledge/lanes` to a directory there) and not to a secret path (.env*,
 * .ssh, keys, keystores), else the call is refused (exit 2) and fledge never
 * starts, as `files-read` refuses the same paths (ROLES-CHAT-8). This is a
 * start-time check. The runs are code-tier, ADMIN-only and allowlisted like
 * `shell-exec`, which reads any file anyway, so they are not clamped.
 *
 * Spawn: fledge is resolved when the command runs, on the absolute PATH
 * entries only (a relative entry such as `.` would let the project pick the
 * binary a read-only command starts). argv arrays only (no shell), cwd pinned
 * to the plugin cwd, the verify lane's scrubbed env (no Discord config,
 * GitHub tokens, audit key, acting identity or LLM keys) without CDPATH /
 * OLDPWD and, like `shell-exec` and the runners, without the owner's GitHub
 * or git credentials (`withoutGitCredentials`, SAFE-21.a: the model may be
 * offered the runs under SAFE-3.a, and a lane or task it runs must not push,
 * open PRs or merge outside the checked GitHub tools), stdin closed, a
 * timeout, per-stream output caps, and the process group killed on timeout or
 * the calling run's abort (spawn.ts). Output is secret-scrubbed (SAFE-6).
 */

import { lstatSync, readdirSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { buildVerifyEnv } from "../../src/agent/verify.ts";
import { get, register } from "../../src/plugins/registry.ts";
import type { PluginCommand, PluginHandlerResult } from "../../src/plugins/types.ts";
import { scrubSecrets } from "../../src/store/scrub.ts";
import { isSecretPath } from "../files/protectedPaths.ts";
import { isInsideRoot, realRoot } from "../files/resolvePath.ts";
import { withoutGitCredentials } from "../runners/commands.ts";
import { cleanText } from "./discover.ts";
import { fledgeLanesRunMustAsk, fledgeRunMustAsk } from "./must-ask.ts";
import { spawnCapped, type SpawnCappedResult } from "./spawn.ts";

export const FLEDGE_CORE_COMMAND_NAMES = [
  "fledge-lanes-list",
  "fledge-lanes-validate",
  "fledge-lanes-run",
  "fledge-run",
] as const;

/** A lane or task name: no leading `-`, no whitespace, no path separators. */
export const FLEDGE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;

/** `lanes list` / `lanes validate` only parse the lane sources. */
export const FLEDGE_CORE_READ_TIMEOUT_MS = 30_000;
/** A lane or task runs builds and tests: as long as a language runner. */
export const FLEDGE_CORE_RUN_TIMEOUT_MS = 600_000;
export const FLEDGE_CORE_MAX_OUTPUT_BYTES = 64 * 1024;

export type FledgeCoreOptions = {
  /** Env the child env is built from and PATH is read from; default: process.env at call time. */
  env?: NodeJS.ProcessEnv;
  readTimeoutMs?: number;
  runTimeoutMs?: number;
  maxOutputBytes?: number;
};

/** fledge on the absolute entries of `env.PATH`, else null. */
export function resolveFledgeBin(env: NodeJS.ProcessEnv): string | null {
  const dirs = (env.PATH ?? "").split(":").filter((d) => d !== "" && isAbsolute(d));
  if (dirs.length === 0) return null;
  const found = Bun.which("fledge", { PATH: dirs.join(":") });
  return found && isAbsolute(found) ? found : null;
}

/**
 * Child env: the verify lane's scrub, no CDPATH / OLDPWD, no GitHub or git
 * credentials (SAFE-21.a, the env `shell-exec` and the runners get),
 * non-interactive, project root hint.
 */
export function fledgeCoreChildEnv(
  base: NodeJS.ProcessEnv,
  projectRoot: string,
): Record<string, string> {
  const env = withoutGitCredentials(buildVerifyEnv(base));
  delete env.CDPATH;
  delete env.OLDPWD;
  env.FLEDGE_NON_INTERACTIVE = "1";
  env.CORVIDINHO_PROJECT_ROOT = projectRoot;
  return env;
}

function usage(error: string): PluginHandlerResult {
  return { ok: false, error, exitCode: 1 };
}

/** Lane sources `lanes list` / `lanes validate` parse: this file and each `*.toml` in the dir. */
const LANES_FILE = "fledge.toml";
const LANES_DIR = ".fledge/lanes";

/**
 * Why `rel` (under the real project `root`) must not be handed to fledge, or
 * null when it is missing or resolves to an allowed `kind` of entry. Errors
 * name the project-relative path only, never an outside target.
 */
function laneSourceProblem(root: string, rel: string, kind: "file" | "dir"): string | null {
  const abs = join(root, rel);
  try {
    lstatSync(abs);
  } catch {
    return null; // missing: fledge reports that itself
  }
  let real: string;
  try {
    real = realpathSync(abs);
  } catch {
    return `${rel} cannot be resolved`;
  }
  if (!isInsideRoot(root, real)) return `${rel} resolves outside the project directory`;
  if (isSecretPath(rel) || isSecretPath(relative(root, real))) return `${rel} resolves to a secret path`;
  let isKind: boolean;
  try {
    const st = statSync(real);
    isKind = kind === "file" ? st.isFile() : st.isDirectory();
  } catch {
    return `${rel} cannot be read`;
  }
  if (!isKind) return `${rel} is not a ${kind === "file" ? "regular file" : "directory"}`;
  return null;
}

/**
 * Why the lane sources of the project at `cwd` must not be parsed by fledge
 * (see the module doc), or null when every one that exists resolves to an
 * allowed entry inside the real project root.
 */
export function laneSourcesRefusal(cwd: string): string | null {
  const root = realRoot(cwd);
  const file = laneSourceProblem(root, LANES_FILE, "file");
  if (file) return file;
  const dir = laneSourceProblem(root, LANES_DIR, "dir");
  if (dir) return dir;
  let entries: string[];
  try {
    entries = readdirSync(join(root, LANES_DIR));
  } catch {
    return null; // no lanes dir
  }
  for (const entry of entries.sort()) {
    if (!entry.toLowerCase().endsWith(".toml")) continue;
    const problem = laneSourceProblem(root, `${LANES_DIR}/${entry}`, "file");
    if (problem) return problem;
  }
  return null;
}

/** A read command's refusal (exit 2; fledge is not started), or null. */
function laneSourcesRefused(name: string, cwd: string): PluginHandlerResult | null {
  const why = laneSourcesRefusal(cwd);
  if (!why) return null;
  return {
    ok: false,
    error: `refused: ${name}: ${why} (fledge would print its contents; ROLES-CHAT-8)`,
    exitCode: 2,
  };
}

type Spawned =
  | { ok: true; bin: string; root: string; res: SpawnCappedResult; output: string }
  | { ok: false; result: PluginHandlerResult };

async function spawnFledge(
  name: string,
  fledgeArgs: string[],
  cwd: string,
  timeoutMs: number,
  opts: FledgeCoreOptions,
  signal?: AbortSignal,
): Promise<Spawned> {
  const env = opts.env ?? process.env;
  const root = resolve(cwd);
  const bin = resolveFledgeBin(env);
  if (!bin) {
    return {
      ok: false,
      result: { ok: false, error: `${name}: fledge not on PATH`, exitCode: 127 },
    };
  }
  const maxBytes = opts.maxOutputBytes ?? FLEDGE_CORE_MAX_OUTPUT_BYTES;
  const res = await spawnCapped([bin, "--non-interactive", ...fledgeArgs], {
    cwd: root,
    env: fledgeCoreChildEnv(env, root),
    timeoutMs,
    maxBytes,
    signal,
  });
  if (res.spawnError) {
    return {
      ok: false,
      result: {
        ok: false,
        error: `${name}: fledge could not start (${bin}): ${scrubSecrets(res.spawnError)}`,
        exitCode: 127,
      },
    };
  }
  let output = scrubSecrets(`${res.stdout}${res.stderr}`);
  if (res.truncated) output += `\n[output truncated at ${maxBytes} bytes per stream]\n`;
  return { ok: true, bin, root, res, output };
}

/** A timeout or abort as a result; null when the run finished. */
function stopped(
  name: string,
  res: SpawnCappedResult,
  timeoutMs: number,
  data?: unknown,
): PluginHandlerResult | null {
  if (res.timedOut) {
    return { ok: false, data, error: `${name} timed out after ${timeoutMs}ms and was killed`, exitCode: 124 };
  }
  if (res.aborted) {
    return { ok: false, data, error: `${name} stopped: the calling run was interrupted`, exitCode: 130 };
  }
  return null;
}

function tailText(output: string, max = 2000): string {
  return output.length > max ? `…${output.slice(output.length - max)}` : output;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Untrusted fledge text headed for the model: scrubbed, control chars out, capped. */
function field(value: unknown, max: number): string {
  return scrubSecrets(cleanText(value, max));
}

export type FledgeLane = {
  name: string;
  description: string;
  steps: number;
  failFast: boolean;
  trustTier: string;
};

/** Parse `lanes list --json`; null when it is not that shape. */
export function parseLanesList(raw: unknown): FledgeLane[] | null {
  if (!raw || typeof raw !== "object") return null;
  const lanes = (raw as { lanes?: unknown }).lanes;
  if (!Array.isArray(lanes)) return null;
  const out: FledgeLane[] = [];
  for (const row of lanes) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const name = field(r.name, 64);
    if (!name) continue;
    out.push({
      name,
      description: field(r.description, 200),
      steps: typeof r.step_count === "number" && Number.isFinite(r.step_count) ? r.step_count : 0,
      failFast: r.fail_fast !== false,
      trustTier: field(r.trust_tier, 24) || "unknown",
    });
  }
  return out;
}

export type FledgeLaneValidation = {
  laneCount: number;
  errors: string[];
  warnings: string[];
};

/** Parse `lanes validate --json`; null when it is not that shape. */
export function parseLanesValidate(raw: unknown): FledgeLaneValidation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.errors) || !Array.isArray(r.warnings)) return null;
  const texts = (xs: unknown[]) => xs.slice(0, 50).map((x) => field(x, 300)).filter(Boolean);
  return {
    laneCount: typeof r.lane_count === "number" && Number.isFinite(r.lane_count) ? r.lane_count : 0,
    errors: texts(r.errors),
    warnings: texts(r.warnings),
  };
}

/** A lane or task run: its output, exit code, and ok only on exit 0. */
function runResult(
  name: string,
  s: Extract<Spawned, { ok: true }>,
  timeoutMs: number,
  extra: Record<string, unknown>,
): PluginHandlerResult {
  const exitCode = s.res.timedOut ? 124 : s.res.aborted ? 130 : s.res.code;
  const data = {
    ...extra,
    cwd: s.root,
    exitCode,
    timedOut: s.res.timedOut,
    aborted: s.res.aborted,
    truncated: s.res.truncated,
    output: s.output,
  };
  const stop = stopped(name, s.res, timeoutMs, data);
  if (stop) return stop;
  if (s.res.code !== 0) {
    const shown = tailText(s.output);
    return {
      ok: false,
      data,
      message: s.output,
      error: `${name} exited ${s.res.code}${shown.trim() ? `:\n${shown}` : ""}`,
      exitCode: s.res.code || 1,
    };
  }
  return { ok: true, data, message: s.output || "(no output)\n", exitCode: 0 };
}

/** The four Fledge core commands; `opts` are test seams (env, timeouts, caps). */
export function fledgeCoreCommands(opts: FledgeCoreOptions = {}): PluginCommand[] {
  const readTimeout = () => opts.readTimeoutMs ?? FLEDGE_CORE_READ_TIMEOUT_MS;
  const runTimeout = () => opts.runTimeoutMs ?? FLEDGE_CORE_RUN_TIMEOUT_MS;
  return [
    {
      name: "fledge-lanes-list",
      description:
        "List the project's Fledge lanes (fledge lanes list): name, step count, description. Read-only; no args.",
      dangerous: false,
      minTier: 0,
      async handler(ctx) {
        const name = "fledge-lanes-list";
        if (ctx.args.length > 0) return usage(`usage: ${name} (no args; lists the lanes of the project's fledge.toml)`);
        const refused = laneSourcesRefused(name, ctx.cwd);
        if (refused) return refused;
        const timeoutMs = readTimeout();
        const s = await spawnFledge(name, ["lanes", "list", "--json"], ctx.cwd, timeoutMs, opts, ctx.signal);
        if (!s.ok) return s.result;
        const stop = stopped(name, s.res, timeoutMs);
        if (stop) return stop;
        if (s.res.code !== 0) {
          const why = tailText(s.output, 500).trim();
          return { ok: false, error: `${name}: fledge lanes list exited ${s.res.code}${why ? `: ${why}` : ""}`, exitCode: s.res.code || 1 };
        }
        const lanes = parseLanesList(parseJson(s.res.stdout));
        if (!lanes) {
          return { ok: false, error: `${name}: fledge lanes list --json returned unexpected output`, exitCode: 1 };
        }
        const lines = lanes.map(
          (l) => `- ${l.name} (${l.steps} step${l.steps === 1 ? "" : "s"})${l.description ? `: ${l.description}` : ""}`,
        );
        const message = `${lanes.length} lane(s)\n${lines.join("\n")}${lines.length ? "\n" : ""}`;
        return { ok: true, data: { count: lanes.length, lanes }, message, exitCode: 0 };
      },
    },
    {
      name: "fledge-lanes-validate",
      description:
        'Validate the lanes in the project\'s fledge.toml (fledge lanes validate): errors and warnings. Read-only. Args: none, or ["--strict"] (warnings fail too).',
      dangerous: false,
      minTier: 0,
      async handler(ctx) {
        const name = "fledge-lanes-validate";
        const strict = ctx.args.length === 1 && ctx.args[0] === "--strict";
        if (ctx.args.length > 0 && !strict) {
          return usage(`usage: ${name} [--strict] (validates the project's fledge.toml; no path argument)`);
        }
        const refused = laneSourcesRefused(name, ctx.cwd);
        if (refused) return refused;
        const timeoutMs = readTimeout();
        const args = ["lanes", "validate", "--json", ...(strict ? ["--strict"] : [])];
        const s = await spawnFledge(name, args, ctx.cwd, timeoutMs, opts, ctx.signal);
        if (!s.ok) return s.result;
        const stop = stopped(name, s.res, timeoutMs);
        if (stop) return stop;
        // fledge prints the JSON report on stdout and exits 1 when the lanes are invalid.
        const report = parseLanesValidate(parseJson(s.res.stdout));
        if (!report) {
          const why = tailText(s.output, 500).trim();
          return {
            ok: false,
            error: `${name}: fledge lanes validate exited ${s.res.code}${why ? `: ${why}` : ""}`,
            exitCode: s.res.code || 1,
          };
        }
        const valid = s.res.code === 0 && report.errors.length === 0 && (!strict || report.warnings.length === 0);
        const detail = [
          ...report.errors.map((e) => `  error: ${e}`),
          ...report.warnings.map((w) => `  warn: ${w}`),
        ];
        const head = `${report.laneCount} lane(s), ${report.errors.length} error(s), ${report.warnings.length} warning(s)${strict ? " (strict)" : ""}`;
        const text = `${head}\n${detail.join("\n")}${detail.length ? "\n" : ""}`;
        const data = { valid, strict, ...report };
        if (!valid) {
          return { ok: false, data, message: text, error: `${name}: lanes are not valid: ${text}`, exitCode: s.res.code || 1 };
        }
        return { ok: true, data, message: text, exitCode: 0 };
      },
    },
    {
      name: "fledge-lanes-run",
      description:
        'Run one of the project\'s Fledge lanes (fledge lanes run <lane>), e.g. ["verify"]. Runs the project\'s own commands: dangerous + minTier=code.',
      dangerous: true,
      minTier: 2,
      // AUTONOMY-9/9.a: a lane whose commands touch prod or deploys asks first.
      mustAsk: fledgeLanesRunMustAsk,
      async handler(ctx) {
        const name = "fledge-lanes-run";
        const lane = ctx.args[0];
        if (ctx.args.length !== 1 || lane === undefined || !FLEDGE_NAME_RE.test(lane)) {
          return usage(`usage: ${name} <lane> (one lane name from fledge-lanes-list, e.g. ["verify"]; no options)`);
        }
        const timeoutMs = runTimeout();
        const s = await spawnFledge(name, ["lanes", "run", lane], ctx.cwd, timeoutMs, opts, ctx.signal);
        if (!s.ok) return s.result;
        return runResult(name, s, timeoutMs, { lane });
      },
    },
    {
      name: "fledge-run",
      description:
        'Run one fledge.toml task (fledge run <task> -- <args>), e.g. ["test"] or ["test","--bail"]; args after the task go to its command verbatim. Runs the project\'s own commands: dangerous + minTier=code.',
      dangerous: true,
      minTier: 2,
      // AUTONOMY-9/9.a: a task whose commands touch prod or deploys asks first.
      mustAsk: fledgeRunMustAsk,
      async handler(ctx) {
        const name = "fledge-run";
        const task = ctx.args[0];
        if (task === undefined || !FLEDGE_NAME_RE.test(task)) {
          return usage(`usage: ${name} <task> [args...] (a fledge.toml task name, e.g. ["test"]; args go to the task's command)`);
        }
        const taskArgs = ctx.args.slice(1).map((a) => String(a));
        const args = ["run", task, ...(taskArgs.length ? ["--", ...taskArgs] : [])];
        const timeoutMs = runTimeout();
        const s = await spawnFledge(name, args, ctx.cwd, timeoutMs, opts, ctx.signal);
        if (!s.ok) return s.result;
        return runResult(name, s, timeoutMs, { task, args: taskArgs });
      },
    },
  ];
}

/**
 * Register the Fledge core builtins (idempotent; a name already registered is
 * left as is). Builtins load before the project's Fledge plugins, so a Fledge
 * plugin command named `run`, `lanes-list`, `lanes-validate` or `lanes-run`
 * is skipped by that load and `plugins list` says so, as fledge's own `run`
 * shadows a plugin command named `run` on fledge's command line.
 */
export function loadFledgeCorePlugins(opts: FledgeCoreOptions = {}): void {
  for (const cmd of fledgeCoreCommands(opts)) {
    if (!get(cmd.name)) register(cmd);
  }
}

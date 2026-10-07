/**
 * AGENT-13 / AGENT-13.a — a headless agent CLI as one of the owner's models.
 *
 * A `cli:<program> [args…]` entry in the model list (src/agent/providers.ts)
 * names an agent CLI the owner runs headless (for example `claude -p` or
 * `codex exec -`). It is not a chat endpoint: it runs a whole execute attempt
 * itself, with its own built-in tools, in the attempt's cwd. Corvidinho
 * cannot narrow those tools to its own allowlist, so the CLI is treated as
 * what it is — a program running commands as the operator's user — and is
 * offered exactly where Corvidinho's own shell is ({@link cliTurnGate}):
 *
 * - the owner's own interactive run (chat, an ask answer, `/session start`,
 *   `/work`, or a local `task run`), inside that talk's own worktree — the
 *   SAFE-3.a gate (`shellToolsGate`), so never a team or community run,
 *   WATCH (even owner-triggered), a schedule, a delegate or council worker,
 *   `--here`, a subdirectory or a non-git folder;
 * - and only when that run's other models would get the shell too: the
 *   run's allowlist names `shell-exec` (SAFE-1 / SAFE-3.a), the tier is
 *   `code` (the shell's tier) with tool rounds allowed, and no tool result in
 *   the run looked like a prompt injection (SAFE-13 drops the shell then).
 *
 * Anywhere else it is skipped with the AGENT-11 fallback notice and the next
 * configured model runs (`failOver`, a `skipped` hop).
 *
 * Where it runs ({@link runCliTurn}): its cwd is the talk worktree; it gets
 * the shell's env (`runnerChildEnv`: the verify-lane scrub of Discord /
 * GitHub / audit / LLM keys, no GitHub or git credentials SAFE-21.a, no cloud
 * credentials SAFE-21.b, `CORVIDINHO_PROJECT_ROOT` so a nested `task run` is
 * refused SAFE-3.a) plus only the keys the owner names in
 * {@link CLI_ENV_PASS_ENV} for the CLI itself (never a git, GitHub, cloud,
 * Discord or audit key); the prompt goes on stdin; it is bounded by the
 * per-request model timeout and the run's stop (its whole process tree is
 * killed, and whatever it left running is stopped when it exits); its turn
 * goes through the SAFE-8 spend guard like any model call (no known price:
 * under a cap it asks on the unknown-price card, SAFE-16.a). Its stdout is
 * the reply, scrubbed (SAFE-6); one JSON object with a string `result`
 * (e.g. `claude -p --output-format json`) gives the reply as `result` and
 * its `usage`, which counts like any model's tokens.
 *
 * After it exits, any protected file it changed (SAFE-2 / SAFE-2.a:
 * `isProtectedPath`, and SpecSync's lifecycle records) is put back as it was
 * before the turn ({@link guardProtectedPaths}); a change it cannot put back
 * fails the attempt. Everything else it changed goes through the run's own
 * verify gate like any edit (the real git diff, the hi and SpecSync gates,
 * the verify lane, test evidence: AGENT-14 / AGENT-15 / AGENT-18).
 */

import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { isProtectedPath, isSddRecordPath } from "../../plugins/files/protectedPaths.ts";
import { spawnCapped, type SpawnCappedResult } from "../../plugins/fledge/spawn.ts";
import { gitEnv, runGit } from "../../plugins/git/exec.ts";
import { parseStatusPorcelainZ } from "../../plugins/git/parse.ts";
import { isCredentialEnvKey, runnerChildEnv } from "../../plugins/runners/commands.ts";
import { isWorkerEnvDropped } from "../autonomous/delegate.ts";
import { redactSecretEnvValues, scrubSecrets } from "../store/scrub.ts";
import { whileIdlePaused } from "./limits.ts";
import { PERSONA_RULES_SYSTEM_INSTRUCTIONS } from "./persona.ts";
import type { RepoWays } from "./repo-ways.ts";
import { UNTRUSTED_CONTENT_AGENT_SYSTEM_INSTRUCTIONS } from "./untrusted.ts";
import {
  CLI_SKIP_DEFAULT_WHY,
  cliArgv,
  entryLabel,
  providerId,
  type ModelFailure,
  type ResolvedProvider,
} from "./providers.ts";
import { shellToolsGate } from "./shell-gate.ts";
import { SpendCapRefusal, type SpendGuard } from "./spend.ts";
import type { CapabilityTier } from "./tier.ts";
import type { AgentTokenUsage } from "./types.ts";
import { isCloudCredentialEnvKey, releaseCloudStandIns, verifyFeedbackExcerpt } from "./verify.ts";
import { startWorkspaceDiff } from "./workspace-diff.ts";

/**
 * Optional: a comma list of env key names passed from the owner's env to a
 * `cli:` model (the keys that CLI itself needs, e.g. `ANTHROPIC_API_KEY`).
 * Unset = none: the CLI uses its own login. A name that is a GitHub / git
 * credential (SAFE-21.a), a cloud credential (SAFE-21.b), or a key no worker
 * gets (Discord config, the audit key, search keys, acting identity) is
 * never passed.
 */
export const CLI_ENV_PASS_ENV = "CORVIDINHO_LLM_CLI_ENV";

/** The tool whose offer the CLI's own tools need (SAFE-3.a): the shell. */
export const CLI_SHELL_TOOL = "shell-exec";

/** Cap on each of the CLI's output streams (the reply is stdout). */
export const CLI_MAX_OUTPUT_BYTES = 256 * 1024;

/** Longest stderr tail a failed turn's error quotes (scrubbed). */
const CLI_STDERR_TAIL_CHARS = 400;

/** Most bytes of protected files kept to put back after a turn (fail closed past it). */
export const CLI_PROTECTED_SNAPSHOT_MAX_BYTES = 32 * 1024 * 1024;

/** Each git read the protected-file guard makes. */
const GUARD_GIT_TIMEOUT_MS = 30_000;

/** The fixed short reasons a skip names (AGENT-13.a, SAFE-6: never config values). */
export const CLI_SKIP_WHY = {
  notOwnerWorktree: CLI_SKIP_DEFAULT_WHY,
  noShell: `needs ${CLI_SHELL_TOOL} in my allowlist (SAFE-3.a)`,
  notCodeTier: "needs the code tier with tool rounds, like the shell",
  injection: "not after a suspected prompt injection (SAFE-13)",
  noGuard: "could not snapshot protected files first (SAFE-2)",
} as const;

export type CliGateVerdict =
  | { granted: true }
  | {
      granted: false;
      /** One fixed short line for the fallback note. */
      why: string;
      /** The operator line's detail (the SAFE-3.a gate's own reason). */
      detail: string;
    };

/**
 * AGENT-13.a: may this execute attempt run a `cli:` model? Re-read for every
 * attempt; any doubt refuses. See the module comment for the rules.
 */
export async function cliTurnGate(opts: {
  env: NodeJS.ProcessEnv;
  cwd: string;
  /** The worktree a local `task run` made for itself (REQ-cli-681), as for `shellToolsGate`. */
  talkWorktree?: string;
  tier: CapabilityTier;
  maxToolRounds: number;
  allowlist: ReadonlySet<string>;
  /** SAFE-13: a tool result in this run already looked like an injection. */
  injectionTripped: boolean;
}): Promise<CliGateVerdict> {
  let shell;
  try {
    shell = await shellToolsGate({ env: opts.env, cwd: opts.cwd, talkWorktree: opts.talkWorktree });
  } catch {
    shell = { granted: false as const, reason: "the SAFE-3.a gate could not be read" };
  }
  if (!shell.granted) {
    return { granted: false, why: CLI_SKIP_WHY.notOwnerWorktree, detail: shell.reason };
  }
  if (!opts.allowlist.has(CLI_SHELL_TOOL)) {
    return {
      granted: false,
      why: CLI_SKIP_WHY.noShell,
      detail: `its own tools include a shell, so it runs only where my allowlist offers ${CLI_SHELL_TOOL}`,
    };
  }
  if (opts.tier !== "code" || opts.maxToolRounds <= 0) {
    return {
      granted: false,
      why: CLI_SKIP_WHY.notCodeTier,
      detail: `this run is on the ${opts.tier} tier${opts.maxToolRounds <= 0 ? " with no tool rounds" : ""}, where my other models get no shell`,
    };
  }
  if (opts.injectionTripped) {
    return {
      granted: false,
      why: CLI_SKIP_WHY.injection,
      detail: "a tool result in this run looked like a prompt injection, so its mutating tools are gone",
    };
  }
  return { granted: true };
}

/** The operator line for a refused `cli:` entry (once per run; never reply text). */
export function cliRefusedLine(label: string, detail: string): string {
  return `[operator] AGENT-13.a: ${label} not run here: ${detail}`;
}

/** The env key names {@link CLI_ENV_PASS_ENV} passes (bad and refused names dropped). */
export function cliPassKeys(env: NodeJS.ProcessEnv): string[] {
  const out: string[] = [];
  for (const raw of (env[CLI_ENV_PASS_ENV] ?? "").split(",")) {
    const key = raw.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || out.includes(key)) continue;
    if (isCredentialEnvKey(key) || isCloudCredentialEnvKey(key) || isWorkerEnvDropped(key)) continue;
    out.push(key);
  }
  return out;
}

/**
 * The CLI's env: the shell's (`runnerChildEnv`; release its cloud stand-ins
 * with `releaseCloudStandIns` once the CLI has exited) plus the set keys
 * {@link cliPassKeys} names that the scrub dropped (a key it set or kept is
 * never overridden).
 */
export function cliChildEnv(base: NodeJS.ProcessEnv, root: string): Record<string, string> {
  const env = runnerChildEnv(base, root);
  for (const key of cliPassKeys(base)) {
    // Only adds a key the scrub dropped: never overrides one it set or kept
    // (`CORVIDINHO_PROJECT_ROOT`, the git / gh / cloud stand-ins).
    if (Object.hasOwn(env, key)) continue;
    const v = base[key];
    if (typeof v === "string" && v !== "") env[key] = v;
  }
  return env;
}

/** What Corvidinho tells the CLI before the task (its rules; the persona and project blocks go around it). */
export const CLI_TURN_INSTRUCTIONS =
  "You are the model for Corvidinho in this run: a headless agent CLI working in the current directory, " +
  "this talk's own git worktree (AGENT-13.a). Do the task below there and nowhere else. " +
  "Corvidinho checks whatever you change with this project's own verify lane (fledge lanes run verify) and its hi and SpecSync gates; " +
  "the run is done only when they pass, so never claim it is done or verified yourself. " +
  "Do not change protected files (.env*, .git, fledge.toml, .fledge/, .trust.toml, bunfig.toml, specs/, *.spec.md, .specsync records, keystores): " +
  "Corvidinho puts back any change to them (SAFE-2). " +
  "You have no GitHub, git-remote or cloud credentials: do not push, open PRs, merge or touch prod; Corvidinho does those through its own checked tools. " +
  "Never read or print secrets. " +
  "Finish with one short plain-text reply for the person who asked; that reply is posted as the answer.";

/**
 * AGENT-18: this repo's own ways, said the way they hold for a CLI turn (it
 * has no hi-draft and no SpecSync change tools, and its protected-file
 * changes are put back). "" when the repo uses neither.
 */
export function cliRepoWaysLines(ways: Pick<RepoWays, "hi" | "sdd"> | undefined): string {
  const lines: string[] = [];
  if (ways?.hi) {
    lines.push(
      "This repo keeps its acceptance criteria in hi/ (AGENT-18). Never invent criteria and never change hi/: " +
        "any change there keeps the run from being verified. If a criterion seems missing or wrong, say so in your reply.",
    );
  }
  if (ways?.sdd) {
    lines.push(
      "This repo works through SpecSync changes (AGENT-18): a changed file its SpecSync workflow cares about that no open change covers " +
        "keeps the run from being verified, and you cannot open or edit a change here (Corvidinho puts back specs/ and .specsync changes). " +
        "If your edits need one, say so in your reply.",
    );
  }
  return lines.join(" ");
}

/** The prompt a CLI turn gets on stdin. */
export function cliTurnPrompt(o: {
  taskText: string;
  attempt: number;
  verifyFeedback?: string;
  /** The rendered SpecSync briefing block ("" when none). */
  specBriefingBlock: string;
  /** PERSONA-2: the persona block, first ("" when none). */
  personaBlock: string;
  /** AGENT-1: the project's AGENTS.md / CLAUDE.md block ("" when none). */
  projectBlock: string;
  /**
   * IDENTITY-4 / SAFE-11: the identity rules every model of the run gets
   * (`IDENTITY_AGENT_SYSTEM_INSTRUCTIONS`, passed in by the execute hook).
   */
  identityRules?: string;
  /** AGENT-18: this repo's ways ({@link cliRepoWaysLines}). */
  repoWays?: Pick<RepoWays, "hi" | "sdd">;
}): string {
  const parts = [
    // PERSONA-2 / PERSONA-3: the persona first, the rules after it win.
    o.personaBlock,
    CLI_TURN_INSTRUCTIONS,
    PERSONA_RULES_SYSTEM_INSTRUCTIONS.trim(),
    // SAFE-11 / SAFE-12 / SAFE-13: like every other model, fenced text from
    // anyone but the owner is data, and who someone is comes only from the
    // acting block.
    (o.identityRules ?? "").trim(),
    UNTRUSTED_CONTENT_AGENT_SYSTEM_INSTRUCTIONS.trim(),
    cliRepoWaysLines(o.repoWays),
    o.projectBlock,
    o.specBriefingBlock.trim(),
    o.taskText ? `Task:\n${o.taskText}` : "Task: (none provided)",
    o.verifyFeedback
      ? `Previous verification feedback (fix these and try again):\n${verifyFeedbackExcerpt(o.verifyFeedback)}`
      : "",
    `Attempt ${o.attempt}.`,
  ];
  return parts.filter((p) => p.trim()).join("\n\n");
}

function count(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : undefined;
}

/**
 * A CLI's reported usage: OpenAI names (`prompt_tokens`, `completion_tokens`,
 * `total_tokens`) or Anthropic names (`input_tokens` plus any cache input
 * tokens, `output_tokens`). Null when it reports none.
 */
export function cliUsage(raw: unknown): AgentTokenUsage | null {
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Record<string, unknown>;
  const inputs = [u.input_tokens, u.cache_creation_input_tokens, u.cache_read_input_tokens]
    .map(count)
    .filter((n): n is number => n !== undefined);
  const prompt = count(u.prompt_tokens) ?? (inputs.length > 0 ? inputs.reduce((a, b) => a + b, 0) : undefined);
  const completion = count(u.completion_tokens) ?? count(u.output_tokens);
  const total = count(u.total_tokens);
  if (prompt === undefined && completion === undefined && total === undefined) return null;
  const promptTokens = prompt ?? 0;
  const completionTokens = completion ?? 0;
  return { promptTokens, completionTokens, totalTokens: total ?? promptTokens + completionTokens };
}

/**
 * The reply and usage in a CLI's stdout: one JSON object with a string
 * `result` gives that and its `usage`; anything else is the reply as is.
 */
export function parseCliOutput(stdout: string): { reply: string; usage: AgentTokenUsage | null } {
  const text = stdout.trim();
  if (text.startsWith("{") && text.endsWith("}")) {
    try {
      const o = JSON.parse(text) as Record<string, unknown>;
      if (o && typeof o === "object" && typeof o.result === "string") {
        return { reply: o.result.trim(), usage: cliUsage(o.usage) };
      }
    } catch {
      /* not one JSON object: plain text */
    }
  }
  return { reply: text, usage: null };
}

/** One output stream, SAFE-6 scrubbed. */
function scrubbed(text: string): string {
  return scrubSecrets(redactSecretEnvValues(text));
}

export type CliTurnResult =
  | { ok: true; reply: string; usage: AgentTokenUsage | null }
  /** `failure` null: not a model failure (the run's stop, a spend-cap stop): never fails over. */
  | { ok: false; error: string; failure: ModelFailure | null };

/**
 * Run one CLI turn (AGENT-13.a) through the SAFE-8 spend guard. Never
 * throws. The caller has already checked {@link cliTurnGate}.
 */
export async function runCliTurn(o: {
  provider: ResolvedProvider;
  cwd: string;
  env: NodeJS.ProcessEnv;
  prompt: string;
  signal: AbortSignal;
  timeoutMs: number;
  spend: Pick<SpendGuard, "call">;
}): Promise<CliTurnResult> {
  const label = entryLabel(o.provider.entry);
  const argv = cliArgv(o.provider.entry);
  if (argv.length === 0) {
    return { ok: false, error: `${label} names no program`, failure: { kind: "exit", code: 127 } };
  }
  const root = resolve(o.cwd);
  let res: SpawnCappedResult;
  try {
    // AGENT-12: like any model call, the idle watchdog is held while the
    // turn runs (a headless CLI prints its reply at the end); the
    // per-request model timeout bounds it.
    res = await whileIdlePaused(() =>
      o.spend.call<SpawnCappedResult>({
        provider: providerId(o.provider),
        model: label,
        requestBytes: Buffer.byteLength(o.prompt, "utf8"),
        signal: o.signal,
        send: async () => {
          const env = cliChildEnv(o.env, root);
          try {
            return await spawnCapped(argv, {
              cwd: root,
              env,
              timeoutMs: o.timeoutMs,
              maxBytes: CLI_MAX_OUTPUT_BYTES,
              signal: o.signal,
              stdin: o.prompt,
              killTreeAfterExit: true,
            });
          } finally {
            releaseCloudStandIns(env);
          }
        },
        outcome: async (r) => ({
          billed: r.spawnError ? "no" : r.code === 0 && !r.timedOut && !r.aborted ? "yes" : "maybe",
          usage: r.code === 0 && !r.spawnError ? parseCliOutput(r.stdout).usage : null,
        }),
      }),
    );
  } catch (err) {
    // SAFE-8: a turn stopped at a spend cap never started; the execute hook
    // turns the guard's recorded ask into the attempt's result.
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `LLM request failed: ${scrubSecrets(msg)}`,
      failure: err instanceof SpendCapRefusal ? null : { kind: "exit", code: 127 },
    };
  }
  if (res.aborted || o.signal.aborted) {
    return { ok: false, error: `${label} stopped: the run was interrupted`, failure: null };
  }
  if (res.timedOut) {
    return { ok: false, error: `${label} timed out after ${o.timeoutMs}ms and was killed`, failure: { kind: "timeout" } };
  }
  if (res.spawnError) {
    return {
      ok: false,
      error: `${label} could not start: ${scrubSecrets(res.spawnError)}`,
      failure: { kind: "exit", code: 127 },
    };
  }
  if (res.code !== 0) {
    const tail = scrubbed(res.stderr).trim().slice(-CLI_STDERR_TAIL_CHARS);
    return {
      ok: false,
      error: `${label} exited ${res.code}${tail ? `: ${tail}` : ""}`,
      failure: { kind: "exit", code: res.code },
    };
  }
  const parsed = parseCliOutput(scrubbed(res.stdout));
  if (!parsed.reply) {
    return { ok: false, error: `${label} gave no reply`, failure: { kind: "malformed" } };
  }
  const reply = res.truncated
    ? `${parsed.reply}\n[reply cut at ${CLI_MAX_OUTPUT_BYTES} bytes]`
    : parsed.reply;
  return { ok: true, reply, usage: parsed.usage };
}

// ─── SAFE-2 guard ─────────────────────────────────────────────────────────

/** A path's state, to put back. */
type PathState =
  | { kind: "file"; mode: number; data: Buffer }
  | { kind: "link"; target: string }
  | { kind: "dir" }
  | { kind: "missing" };

/** A path the CLI turn may not change: SAFE-2 / SAFE-2.a infra, and SpecSync's lifecycle records. */
export function isCliProtectedPath(path: string): boolean {
  return isProtectedPath(path) || isSddRecordPath(path);
}

function readState(abs: string): PathState {
  let st;
  try {
    st = lstatSync(abs);
  } catch {
    return { kind: "missing" };
  }
  if (st.isSymbolicLink()) return { kind: "link", target: readlinkSync(abs) };
  if (st.isDirectory()) return { kind: "dir" };
  if (!st.isFile()) throw new Error(`not a regular file: ${abs}`);
  // No follow, no block: a path swapped after lstat is never read through.
  const fd = openSync(abs, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const fst = fstatSync(fd);
    return { kind: "file", mode: fst.mode & 0o7777, data: readFileSync(fd) };
  } finally {
    closeSync(fd);
  }
}

function sameState(a: PathState, b: PathState): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "file" && b.kind === "file") return a.mode === b.mode && a.data.equals(b.data);
  if (a.kind === "link" && b.kind === "link") return a.target === b.target;
  return true;
}

/** `git <args>` in `root` as raw bytes (hooks off, no prompts, repo env stripped); null on any failure. */
function gitBytes(root: string, args: string[]): Buffer | null {
  try {
    const r = Bun.spawnSync(["git", "-c", "core.hooksPath=/dev/null", ...args], {
      cwd: root,
      env: gitEnv(root),
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: GUARD_GIT_TIMEOUT_MS,
    });
    return r.exitCode === 0 ? Buffer.from(r.stdout) : null;
  } catch {
    return null;
  }
}

/** A path's state at `head` (missing when not there); null when git cannot say. */
function headState(root: string, head: string | null, path: string): PathState | null {
  if (!head) return { kind: "missing" };
  const listed = gitBytes(root, ["ls-tree", "-z", head, "--", path]);
  if (listed === null) return null;
  const line = listed.toString("utf8").split("\0")[0] ?? "";
  if (!line) return { kind: "missing" };
  const m = /^(\d{6}) (\w+) ([0-9a-f]+)\t/.exec(line);
  if (!m) return null;
  const [, mode, type, oid] = m;
  if (type === "tree") return { kind: "dir" };
  if (type !== "blob") return { kind: "missing" };
  const data = gitBytes(root, ["cat-file", "blob", oid!]);
  if (data === null) return null;
  if (mode === "120000") return { kind: "link", target: data.toString("utf8") };
  return { kind: "file", mode: mode === "100755" ? 0o755 : 0o644, data };
}

/** True when `abs`'s nearest existing ancestor resolves inside `realRoot`. */
function parentInside(realRoot: string, abs: string): boolean {
  let dir = dirname(abs);
  for (;;) {
    try {
      const real = realpathSync(dir);
      return real === realRoot || real.startsWith(realRoot + sep);
    } catch {
      const up = dirname(dir);
      if (up === dir) return false;
      dir = up;
    }
  }
}

/** Put `state` back at `abs` (inside the real root, never through a link). */
function writeState(realRoot: string, abs: string, state: PathState): void {
  if (!parentInside(realRoot, abs)) throw new Error("its folder leads outside the worktree");
  if (state.kind === "dir") {
    try {
      if (lstatSync(abs).isDirectory()) return;
    } catch {
      /* missing: made below */
    }
    rmSync(abs, { recursive: true, force: true });
    mkdirSync(abs, { recursive: true });
    return;
  }
  rmSync(abs, { recursive: true, force: true });
  if (state.kind === "missing") return;
  mkdirSync(dirname(abs), { recursive: true });
  if (!parentInside(realRoot, abs)) throw new Error("its folder leads outside the worktree");
  if (state.kind === "link") {
    symlinkSync(state.target, abs);
    return;
  }
  writeFileSync(abs, state.data, { flag: "wx", mode: state.mode });
  chmodSync(abs, state.mode);
}

export type ProtectedRestore =
  | { ok: true; restored: string[] }
  | { ok: false; error: string; paths: string[] };

/** What {@link guardProtectedPaths} returns: call `restore` once the CLI has exited. */
export type ProtectedGuard = { restore(): Promise<ProtectedRestore> };

/**
 * SAFE-2 for a CLI turn: snapshot, before the turn, the state of every
 * protected path that is dirty or untracked in the talk worktree `root`
 * (its HEAD holds the rest) and the worktree's own `.git` file, plus a
 * run-start diff (`startWorkspaceDiff`, nested: it never touches the talk's
 * verified marker). `restore()` puts every protected path the turn changed
 * back — to its snapshot, else to its HEAD state (removed when HEAD has
 * none) — parents first, never writing through a link out of the worktree.
 * Null when the snapshot cannot be taken (the turn is then not run).
 */
export async function guardProtectedPaths(root: string): Promise<ProtectedGuard | null> {
  let realRoot: string;
  try {
    realRoot = realpathSync(root);
  } catch {
    return null;
  }
  const headRun = await runGit(realRoot, ["rev-parse", "--verify", "-q", "HEAD"], { timeoutMs: GUARD_GIT_TIMEOUT_MS });
  if (headRun.timedOut || headRun.truncated || (headRun.code !== 0 && headRun.code !== 1)) return null;
  const head = headRun.code === 0 ? headRun.stdout.trim() || null : null;
  const status = await runGit(
    realRoot,
    ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames"],
    { timeoutMs: GUARD_GIT_TIMEOUT_MS, maxStdoutBytes: 8 * 1024 * 1024 },
  );
  if (status.code !== 0 || status.truncated || status.timedOut) return null;
  const saved = new Map<string, PathState>();
  let bytes = 0;
  try {
    for (const e of parseStatusPorcelainZ(status.stdout).entries) {
      for (const p of [e.path, e.origPath]) {
        if (!p || saved.has(p) || !isCliProtectedPath(p)) continue;
        const st = readState(join(realRoot, p));
        if (st.kind === "file") bytes += st.data.byteLength;
        if (bytes > CLI_PROTECTED_SNAPSHOT_MAX_BYTES) return null;
        saved.set(p, st);
      }
    }
  } catch {
    return null;
  }
  const gitFile = join(realRoot, ".git");
  let gitFileState: PathState;
  try {
    gitFileState = readState(gitFile);
  } catch {
    return null;
  }
  const tracker = await startWorkspaceDiff(realRoot, {}, { nested: true });
  if (!tracker) return null;

  return {
    async restore(): Promise<ProtectedRestore> {
      let changed: string[] | null;
      try {
        changed = await tracker.changed();
      } catch {
        changed = null;
      }
      const touched: string[] = [];
      let gitNow: PathState | null;
      try {
        gitNow = readState(gitFile);
      } catch {
        gitNow = null;
      }
      if (gitNow === null || !sameState(gitNow, gitFileState)) touched.push(".git");
      if (changed === null) {
        return { ok: false, error: "could not read what it changed in the worktree", paths: touched };
      }
      for (const p of changed) {
        const rel = relative(realRoot, resolve(realRoot, p));
        if (rel && !rel.startsWith("..") && isCliProtectedPath(rel) && !touched.includes(rel)) touched.push(rel);
      }
      // Parents first: a protected folder swapped for a link is undone
      // before anything is written under it.
      touched.sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
      const restored: string[] = [];
      const failed: string[] = [];
      for (const p of touched) {
        const target = p === ".git" ? gitFileState : (saved.get(p) ?? headState(realRoot, head, p));
        try {
          if (!target) throw new Error("git could not give its earlier state");
          writeState(realRoot, join(realRoot, p), target);
          restored.push(p);
        } catch {
          failed.push(p);
        }
      }
      if (failed.length > 0) {
        return { ok: false, error: "could not put back every protected file it changed", paths: failed };
      }
      return { ok: true, restored };
    },
  };
}

/** Paths named in a note before "…". */
const NOTE_PATHS = 5;

/** `a, b, c, …` for a note. */
export function pathPreview(paths: readonly string[]): string {
  const shown = paths.slice(0, NOTE_PATHS).join(", ");
  return paths.length > NOTE_PATHS ? `${shown}, …` : shown;
}

/** The note a reply ends with when protected files the CLI changed were put back (SAFE-2). */
export function cliRestoredNote(paths: readonly string[]): string {
  return `(Protected files the headless agent CLI changed were put back, SAFE-2: ${pathPreview(paths)})`;
}

/** A turn's failed result line when a protected change could not be put back (SAFE-2, fail closed). */
export function cliRestoreFailedLine(label: string, r: Extract<ProtectedRestore, { ok: false }>): string {
  const what = r.paths.length > 0 ? `: ${pathPreview(r.paths)}` : "";
  return `${label} ran, but Corvidinho ${r.error}${what} (SAFE-2), so this run is not verified.`;
}

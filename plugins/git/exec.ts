/**
 * Git process runner for the git plugins (PLUGIN-1 / SAFE-3 / REQ-plugins-182).
 *
 * - argv arrays via Bun.spawn — never a shell string.
 * - cwd clamped: GIT_CEILING_DIRECTORIES stops discovery above the plugin cwd,
 *   and `gitRoot` requires the cwd to be the repository / worktree top level.
 * - No prompts (GIT_TERMINAL_PROMPT=0, stdin closed); credentials come only
 *   from the environment or the configured credential helper.
 * - Hooks disabled (`core.hooksPath=/dev/null`) so an agent-written hook file
 *   cannot turn a commit or push into host code execution.
 */

import { realpathSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { scrubSecrets } from "../../src/store/scrub.ts";
import { redactUrlCredentials } from "./parse.ts";

export const GIT_READ_TIMEOUT_MS = 30_000;
export const GIT_WRITE_TIMEOUT_MS = 120_000;
const STDERR_MAX_CHARS = 16_384;

/** Inherited env that could point git at another repository or run programs. */
const STRIPPED_ENV = new Set([
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_NAMESPACE",
  "GIT_PREFIX",
  "GIT_CEILING_DIRECTORIES",
  "GIT_DISCOVERY_ACROSS_FILESYSTEM",
  "GIT_EXTERNAL_DIFF",
  // Conflict with GIT_LITERAL_PATHSPECS (git refuses mixed global pathspec modes).
  "GIT_GLOB_PATHSPECS",
  "GIT_NOGLOB_PATHSPECS",
  "GIT_ICASE_PATHSPECS",
]);

/** Child env for git: inherited env minus repo-locating vars, plus no-prompt guards. */
export function gitEnv(
  root: string,
  base: NodeJS.ProcessEnv = process.env,
  literalPathspecs = true,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) {
    if (v === undefined || STRIPPED_ENV.has(k) || k === "GIT_LITERAL_PATHSPECS") continue;
    env[k] = v;
  }
  env.GIT_TERMINAL_PROMPT = "0";
  env.GCM_INTERACTIVE = "never";
  env.GIT_EDITOR = "true";
  env.GIT_PAGER = "cat";
  // Paths are data: no glob / `:(magic)` expansion (check-ignore cannot take it).
  if (literalPathspecs) env.GIT_LITERAL_PATHSPECS = "1";
  env.GIT_OPTIONAL_LOCKS = "0";
  // Only `root` itself is examined for a repository; parents are never searched.
  env.GIT_CEILING_DIRECTORIES = dirname(root);
  return env;
}

export type GitRun = {
  code: number;
  stdout: string;
  /** Bytes of stdout kept (≤ maxStdoutBytes when capped). */
  stdoutBytes: number;
  /** True when stdout hit maxStdoutBytes and the process was stopped. */
  truncated: boolean;
  stderr: string;
  timedOut: boolean;
};

export type RunGitOptions = {
  timeoutMs?: number;
  maxStdoutBytes?: number;
  env?: NodeJS.ProcessEnv;
  /** Default true; only commands that reject literal magic turn it off. */
  literalPathspecs?: boolean;
  /**
   * A temporary index for this call (`GIT_INDEX_FILE`; the inherited one is
   * always stripped). GITHUB-9 `reviewTree` stages the work tree into a copy
   * so the real index never changes.
   */
  indexFile?: string;
};

async function readCapped(
  stream: ReadableStream<Uint8Array>,
  cap: number | undefined,
  onCap: () => void,
): Promise<{ text: string; bytes: number; truncated: boolean }> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (cap != null && bytes + value.byteLength > cap) {
      const take = cap - bytes;
      if (take > 0) {
        chunks.push(value.subarray(0, take));
        bytes += take;
      }
      truncated = true;
      onCap();
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
    bytes += value.byteLength;
  }
  return { text: Buffer.concat(chunks).toString("utf8"), bytes, truncated };
}

/** Run `git <args>` in `root` (argv array, no shell, hooks off, no prompts). */
export async function runGit(
  root: string,
  args: readonly string[],
  opts: RunGitOptions = {},
): Promise<GitRun> {
  const env = gitEnv(root, opts.env, opts.literalPathspecs ?? true);
  if (opts.indexFile) env.GIT_INDEX_FILE = opts.indexFile;
  const proc = Bun.spawn(["git", "-c", "core.hooksPath=/dev/null", ...args], {
    cwd: root,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const kill = () => {
    try {
      proc.kill();
    } catch {
      /* already exited */
    }
  };
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    kill();
  }, opts.timeoutMs ?? GIT_READ_TIMEOUT_MS);
  try {
    const [out, err] = await Promise.all([
      readCapped(proc.stdout, opts.maxStdoutBytes, kill),
      new Response(proc.stderr).text(),
    ]);
    const exit = await proc.exited;
    return {
      code: out.truncated ? 0 : timedOut ? 124 : exit,
      stdout: out.text,
      stdoutBytes: out.bytes,
      truncated: out.truncated,
      stderr: (timedOut ? "timed out; " : "") + err.slice(0, STDERR_MAX_CHARS),
      timedOut,
    };
  } finally {
    clearTimeout(timer);
  }
}

export type GitRootResult =
  | { ok: true; root: string }
  | { ok: false; error: string; exitCode: number };

/**
 * Resolve the plugin cwd and require it to be a repository top level (SAFE-3):
 * git tools never operate on a repository found in a parent directory.
 */
export async function gitRoot(cwd: string): Promise<GitRootResult> {
  let root: string;
  try {
    root = realpathSync(resolve(cwd));
    if (!statSync(root).isDirectory()) throw new Error("not a directory");
  } catch {
    return { ok: false, error: `plugin cwd is not a directory: ${cwd}`, exitCode: 1 };
  }
  const refused: GitRootResult = {
    ok: false,
    error:
      `refused (SAFE-3): plugin cwd ${root} is not a git repository top level; ` +
      `git tools only run at the task worktree root and never search parent directories`,
    exitCode: 2,
  };
  const r = await runGit(root, ["rev-parse", "--show-toplevel"]);
  if (r.code !== 0) return refused;
  let top = r.stdout.trim();
  try {
    top = realpathSync(top);
  } catch {
    /* keep git's answer */
  }
  return top === root ? { ok: true, root } : refused;
}

/** Redact URL credentials and vendor-key-looking secrets (SAFE-6) from git output. */
export function scrubGitOutput(text: string): string {
  return scrubSecrets(redactUrlCredentials(text));
}

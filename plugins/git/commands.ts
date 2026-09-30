/**
 * Git plugins (PLUGIN-1/2 / REQ-plugins-182) — typed git for the task worktree.
 * Reads are safe (minTier 0). Mutators are dangerous + code tier (SAFE-1).
 * Steal shape: Merlin fledge-plugin-git (typed commands, mutators dangerous).
 *
 * Never exposed: force push, amend, rebase, reset, merge, `--all` staging.
 * Draft SAFE-22 (default-branch policy) awaits HI capture — not enforced here.
 */

import { lstatSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve, sep } from "node:path";
import { tryLoadAllowlist } from "../../src/allowlist/load.ts";
import { checkRepoGate } from "../../src/plugins/githubDeny.ts";
import type {
  MustAskVerdict,
  PluginCommand,
  PluginHandlerArgs,
  PluginHandlerResult,
} from "../../src/plugins/types.ts";
import {
  hasKeystoreComponent,
  isProtectedPath,
  isSecretPath,
  protectedRefuseMessage,
  SECRET_GIT_EXCLUDE_PATHSPECS,
  secretPathsRefused,
  secretRefuseMessage,
} from "../files/protectedPaths.ts";
import { isInsideRoot, PathEscapeError, resolveProjectPath } from "../files/resolvePath.ts";
import {
  GIT_WRITE_TIMEOUT_MS,
  gitRoot,
  runGit,
  scrubGitOutput,
  type GitRun,
} from "./exec.ts";
import {
  parseNameStatusZ,
  parsePushPorcelain,
  parseStatusPorcelainZ,
  redactUrlCredentials,
  repoSlugFromRemoteUrl,
  type StatusResult,
} from "./parse.ts";

const STATUS_MAX_BYTES = 512 * 1024;
const DIFF_DEFAULT_MAX_BYTES = 64 * 1024;
const DIFF_HARD_MAX_BYTES = 1024 * 1024;
const LOG_DEFAULT = 10;
const LOG_MAX = 100;

class ArgError extends Error {
  constructor(
    message: string,
    readonly exitCode: number = 1,
  ) {
    super(message);
    this.name = "ArgError";
  }
}

type ArgSpec = {
  bool?: readonly string[];
  value?: readonly string[];
  alias?: Readonly<Record<string, string>>;
  /** Flags refused outright with a specific message (exit 2). */
  refuse?: Readonly<Record<string, string>>;
};

type ParsedArgs = {
  flags: Set<string>;
  values: Map<string, string>;
  positional: string[];
};

/** Strict argv parser: unknown flags are refused; `--` ends options. */
function parseArgs(args: readonly string[], spec: ArgSpec): ParsedArgs {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const positional: string[] = [];
  let endOfOptions = false;
  for (let i = 0; i < args.length; i++) {
    const raw = args[i]!;
    if (endOfOptions) {
      positional.push(raw);
      continue;
    }
    if (raw === "--") {
      endOfOptions = true;
      continue;
    }
    if (raw.length > 1 && raw.startsWith("-")) {
      const eq = raw.startsWith("--") ? raw.indexOf("=") : -1;
      const given = eq > 0 ? raw.slice(0, eq) : raw;
      const inline = eq > 0 ? raw.slice(eq + 1) : undefined;
      const name = spec.alias?.[given] ?? given;
      if (name === "--json") continue;
      const refusal = spec.refuse?.[name];
      if (refusal) throw new ArgError(refusal, 2);
      if (spec.bool?.includes(name)) {
        if (inline !== undefined) throw new ArgError(`${given} takes no value`);
        flags.add(name);
        continue;
      }
      if (spec.value?.includes(name)) {
        const v = inline ?? args[++i];
        if (v === undefined) throw new ArgError(`missing value for ${given}`);
        values.set(name, v);
        continue;
      }
      const allowed = [...(spec.bool ?? []), ...(spec.value ?? [])];
      throw new ArgError(
        `unsupported flag ${given} (allowed: ${allowed.length ? allowed.join(", ") : "none"})`,
      );
    }
    positional.push(raw);
  }
  return { flags, values, positional };
}

function intFlag(
  raw: string | undefined,
  dflt: number,
  min: number,
  max: number,
  name: string,
): number {
  if (raw === undefined) return dflt;
  if (!/^\d+$/.test(raw.trim())) throw new ArgError(`${name} must be a positive integer`);
  return Math.min(max, Math.max(min, Number(raw.trim())));
}

/** Revision text that cannot be read as an option (log / branch start points). */
function isSafeRev(rev: string): boolean {
  return /^[A-Za-z0-9@][A-Za-z0-9._/@{}~^-]*$/.test(rev);
}

function fail(error: string, exitCode = 1, data?: unknown): PluginHandlerResult {
  return data === undefined ? { ok: false, error, exitCode } : { ok: false, error, exitCode, data };
}

function gitFail(r: GitRun, what: string): PluginHandlerResult {
  const detail = scrubGitOutput((r.stderr || r.stdout).trim());
  return fail(`${what} failed${detail ? `: ${detail}` : ` (exit ${r.code})`}`);
}

function ok(data: unknown, message: string): PluginHandlerResult {
  return { ok: true, data, message, exitCode: 0 };
}

/** Clamp to the repo root and run the handler; map arg/path errors to results. */
async function inRepo(
  ctx: PluginHandlerArgs,
  fn: (root: string) => Promise<PluginHandlerResult>,
): Promise<PluginHandlerResult> {
  try {
    const r = await gitRoot(ctx.cwd);
    if (!r.ok) return fail(r.error, r.exitCode);
    return await fn(r.root);
  } catch (e) {
    if (e instanceof ArgError) return fail(e.message, e.exitCode);
    if (e instanceof PathEscapeError) return fail(e.message, 1);
    return fail(e instanceof Error ? e.message : String(e));
  }
}

/**
 * Resolve a user path inside the repo root (files-plugin clamp: `..`,
 * absolute-outside and symlink escapes refused) and return it repo-relative.
 */
function clampRel(root: string, userPath: string): string {
  resolveProjectPath(root, userPath);
  const raw = userPath.trim();
  const lexical = isAbsolute(raw) ? normalize(raw) : resolve(root, raw);
  if (!isInsideRoot(root, lexical)) {
    throw new PathEscapeError(
      `Path traversal denied: "${raw}" resolves outside the project directory`,
    );
  }
  const rel = relative(root, lexical).split(sep).join("/");
  return rel === "" ? "." : rel;
}

async function currentBranch(root: string): Promise<string | null> {
  const r = await runGit(root, ["symbolic-ref", "--short", "-q", "HEAD"]);
  const b = r.stdout.trim();
  return r.code === 0 && b ? b : null;
}

/** Why a path must not be staged, or null when it may be. */
function stagingRefusal(rel: string, deleted: boolean): string | null {
  const parts = rel.split("/").map((p) => p.toLowerCase());
  if (parts.includes(".git")) {
    return `refused (SAFE-2): '${rel}' is git metadata`;
  }
  if (deleted && isProtectedPath(rel)) {
    return `${protectedRefuseMessage(rel)} git-commit will not stage its deletion.`;
  }
  // Any `.env*` or keystore component (a file in `keystore/` too). `rel` is
  // repo-relative, so the checkout's own parent dirs never count.
  if (
    parts.some((p) => p === ".env" || p.startsWith(".env.")) ||
    hasKeystoreComponent(parts)
  ) {
    return (
      `refused: '${rel}' looks secret-bearing (.env* / keystore); ` +
      `git-commit never stages it (secrets stay out of the repo)`
    );
  }
  return null;
}

function formatStatus(s: StatusResult): string {
  const head = s.detached
    ? "## HEAD (detached)"
    : `## ${s.branch ?? "?"}${s.initial ? " (no commits yet)" : ""}` +
      (s.upstream ? `...${s.upstream}` : "") +
      (s.upstreamGone
        ? " [gone]"
        : s.ahead || s.behind
          ? ` [ahead ${s.ahead}, behind ${s.behind}]`
          : "");
  const lines = s.entries.map(
    (e) => `${e.index}${e.worktree} ${e.origPath ? `${e.origPath} -> ` : ""}${e.path}`,
  );
  return [head, ...(lines.length ? lines : ["(clean)"])].join("\n") + "\n";
}

const NO_FORCE =
  "refused: git-push never force-pushes, deletes, mirrors or pushes other refs; it pushes the current branch only";
const PUSH_REFUSE: Record<string, string> = {
  "--force": NO_FORCE,
  "-f": NO_FORCE,
  "--force-with-lease": NO_FORCE,
  "--force-if-includes": NO_FORCE,
  "--mirror": NO_FORCE,
  "--delete": NO_FORCE,
  "-d": NO_FORCE,
  "--prune": NO_FORCE,
  "--all": NO_FORCE,
  "--branches": NO_FORCE,
  "--tags": NO_FORCE,
  "--follow-tags": NO_FORCE,
};

const NO_REWRITE =
  "refused: git-commit never amends or rewrites history (not exposed)";
const COMMIT_REFUSE: Record<string, string> = {
  "--amend": NO_REWRITE,
  "--fixup": NO_REWRITE,
  "--squash": NO_REWRITE,
  "--all": "refused: git-commit stages explicit file paths only (no --all)",
  "-a": "refused: git-commit stages explicit file paths only (no --all)",
};

const BRANCH_REFUSE: Record<string, string> = {
  "--force": "refused: git-branch-create never resets or moves an existing branch",
  "-f": "refused: git-branch-create never resets or moves an existing branch",
  "-C": "refused: git-branch-create never resets or moves an existing branch",
  "-B": "refused: git-branch-create never resets or moves an existing branch",
  "-D": "refused: git-branch-create does not delete branches",
  "-d": "refused: git-branch-create does not delete branches",
  "--delete": "refused: git-branch-create does not delete branches",
};

/**
 * Branch names a remote usually deploys or releases from; a push of one asks
 * when the remote's default branch is not recorded locally.
 */
const USUAL_DEFAULT_BRANCHES = new Set([
  "main", "master", "trunk", "default", "production", "prod", "live", "release", "stable", "deploy", "gh-pages",
]);

/**
 * AUTONOMY-9 (#97): a push to the remote's default branch is a deploy and
 * asks; a feature-branch push does not. The default is the remote's recorded
 * HEAD (`refs/remotes/<remote>/HEAD`); when none is recorded, a push of a
 * usual default name asks. A call the handler would refuse (no repo,
 * detached HEAD, a bad remote) is left to it.
 */
async function gitPushMustAsk(ctx: { args: string[]; cwd: string }): Promise<MustAskVerdict> {
  const r = await gitRoot(ctx.cwd);
  if (!r.ok) return null;
  const root = r.root;
  let a: ParsedArgs;
  try {
    a = parseArgs(ctx.args, {
      value: ["--remote", "--repo"],
      bool: ["--set-upstream"],
      alias: { "-u": "--set-upstream", "-R": "--repo" },
      refuse: PUSH_REFUSE,
    });
  } catch {
    return null;
  }
  const branch = await currentBranch(root);
  if (!branch) return null;
  const remote = a.values.get("--remote") ?? a.positional[0] ?? "origin";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(remote)) return null;
  const head = await runGit(root, ["symbolic-ref", "--quiet", "--short", `refs/remotes/${remote}/HEAD`]);
  const recorded = head.code === 0 ? head.stdout.trim() : "";
  const def = recorded.startsWith(`${remote}/`) ? recorded.slice(remote.length + 1) : null;
  const target = `branch ${branch} → remote ${remote}`;
  if (def !== null) {
    return branch === def
      ? { ask: { class: "prod", why: `pushes ${branch}, ${remote}'s default branch (a deploy)`, target } }
      : null;
  }
  return USUAL_DEFAULT_BRANCHES.has(branch)
    ? {
        ask: {
          class: "prod",
          why: `pushes ${branch}, a usual default branch name, and ${remote}'s default branch is not recorded here (it may be a deploy)`,
          target,
        },
      }
    : null;
}

export const gitCommands: PluginCommand[] = [
  {
    name: "git-status",
    description:
      "Working-tree status as JSON (porcelain v1): branch, upstream, ahead/behind, staged / unstaged / untracked / conflicted paths. Args: none. e.g. []",
    dangerous: false,
    minTier: 0,
    handler: (ctx) =>
      inRepo(ctx, async (root) => {
        const a = parseArgs(ctx.args, {});
        if (a.positional.length) return fail("usage: git-status (takes no arguments)");
        // --untracked-files=all: list each new file (not a collapsed `dir/`) so the
        // paths can go straight to git-commit; the byte cap bounds the output.
        const r = await runGit(
          root,
          ["status", "--porcelain=v1", "-z", "--branch", "--untracked-files=all"],
          { maxStdoutBytes: STATUS_MAX_BYTES },
        );
        if (r.code !== 0) return gitFail(r, "git status");
        // Drop a record cut in half by the byte cap.
        const out = r.truncated ? r.stdout.slice(0, r.stdout.lastIndexOf("\0") + 1) : r.stdout;
        const status = parseStatusPorcelainZ(out);
        return ok({ ...status, truncated: r.truncated }, formatStatus(status));
      }),
  },
  {
    name: "git-diff",
    description:
      `Unified diff of the worktree vs the index (default) or the index vs HEAD (--staged); untracked files are not shown. Capped at --max-bytes (default ${DIFF_DEFAULT_MAX_BYTES}, max ${DIFF_HARD_MAX_BYTES}). Args: [--staged] [--max-bytes N] [path...]. e.g. [] or ["--staged"] or ["src/a.ts"]`,
    dangerous: false,
    minTier: 0,
    handler: (ctx) =>
      inRepo(ctx, async (root) => {
        const a = parseArgs(ctx.args, {
          bool: ["--staged"],
          value: ["--max-bytes"],
          alias: { "--cached": "--staged" },
        });
        const staged = a.flags.has("--staged");
        const maxBytes = intFlag(
          a.values.get("--max-bytes"),
          DIFF_DEFAULT_MAX_BYTES,
          1,
          DIFF_HARD_MAX_BYTES,
          "--max-bytes",
        );
        // ROLES-CHAT-8: non-ADMIN role sessions never see a tracked secret
        // file's diff, the same gate files-read and search-grep apply.
        const hideSecrets = await secretPathsRefused();
        const paths = a.positional.map((p) => {
          const rel = clampRel(root, p);
          if (
            hideSecrets &&
            (isSecretPath(p) ||
              isSecretPath(rel) ||
              isSecretPath(relative(root, resolveProjectPath(root, p))))
          ) {
            throw new ArgError(secretRefuseMessage(p), 2);
          }
          return rel;
        });
        // The secret excludes need pathspec magic, so a non-ADMIN run turns
        // GIT_LITERAL_PATHSPECS off and keeps user paths literal per element.
        const pathspecs = hideSecrets
          ? [...paths.map((p) => `:(literal)${p}`), ...SECRET_GIT_EXCLUDE_PATHSPECS]
          : paths;
        const literalPathspecs = !hideSecrets;
        const which = staged ? ["--cached"] : [];
        const ns = await runGit(
          root,
          ["diff", "--name-status", "-z", "--no-ext-diff", ...which, "--", ...pathspecs],
          { maxStdoutBytes: DIFF_HARD_MAX_BYTES, literalPathspecs },
        );
        if (ns.code !== 0) return gitFail(ns, "git diff");
        const files = parseNameStatusZ(
          ns.truncated ? ns.stdout.slice(0, ns.stdout.lastIndexOf("\0") + 1) : ns.stdout,
        );
        // Fail closed if a secret path got past the excludes.
        const leaked = hideSecrets
          ? files.find((f) => isSecretPath(f.path) || (f.origPath != null && isSecretPath(f.origPath)))
          : undefined;
        if (leaked) return fail(secretRefuseMessage(leaked.path), 2);
        const d = await runGit(
          root,
          [
            "diff",
            "--no-color",
            "--no-ext-diff",
            "--no-textconv",
            ...which,
            "--",
            ...pathspecs,
          ],
          { maxStdoutBytes: maxBytes, literalPathspecs },
        );
        if (d.code !== 0) return gitFail(d, "git diff");
        const data = {
          staged,
          files,
          diff: d.stdout,
          bytes: d.stdoutBytes,
          truncated: d.truncated,
          maxBytes,
        };
        const summary =
          `${files.length} file(s) ${staged ? "staged" : "changed in the worktree"}, ` +
          `${d.stdoutBytes} byte diff${d.truncated ? ` (truncated at ${maxBytes})` : ""}`;
        if (ctx.json) return ok(data, summary);
        return ok(
          data,
          (d.stdout || "(no diff)\n") + (d.truncated ? `\n[truncated at ${maxBytes} bytes]\n` : ""),
        );
      }),
  },
  {
    name: "git-log",
    description:
      `Recent commits, oneline (sha, short, author, date, subject). Args: [-n N (default ${LOG_DEFAULT}, max ${LOG_MAX})] [ref]. e.g. ["-n","5"] or ["main"]`,
    dangerous: false,
    minTier: 0,
    handler: (ctx) =>
      inRepo(ctx, async (root) => {
        const a = parseArgs(ctx.args, {
          value: ["--limit"],
          alias: { "-n": "--limit", "--max-count": "--limit" },
        });
        if (a.positional.length > 1) return fail("usage: git-log [-n N] [ref]");
        const ref = a.positional[0];
        if (ref !== undefined && !isSafeRev(ref)) return fail(`invalid ref: ${ref}`);
        const n = intFlag(a.values.get("--limit"), LOG_DEFAULT, 1, LOG_MAX, "-n");
        if (ref === undefined) {
          const head = await runGit(root, ["rev-parse", "--verify", "-q", "HEAD"]);
          if (head.code !== 0) {
            return ok({ ref: "HEAD", count: 0, commits: [] }, "(no commits yet)\n");
          }
        }
        const r = await runGit(root, [
          "log",
          `--max-count=${n}`,
          "--no-color",
          "--no-show-signature",
          "--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s",
          ref ?? "HEAD",
          "--",
        ]);
        if (r.code !== 0) return gitFail(r, "git log");
        const commits = r.stdout
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [sha = "", short = "", author = "", date = "", ...rest] = line.split("\x1f");
            return { sha, short, author, date, subject: rest.join("\x1f") };
          });
        const message = commits.map((c) => `${c.short} ${c.subject}`).join("\n");
        return ok(
          { ref: ref ?? "HEAD", count: commits.length, commits },
          message ? `${message}\n` : "(no commits)\n",
        );
      }),
  },
  {
    name: "git-branch-list",
    description:
      "List local branches (or --remotes / --all) with the current branch marked, short sha and upstream tracking. Args: [--remotes|--all]. e.g. []",
    dangerous: false,
    minTier: 0,
    handler: (ctx) =>
      inRepo(ctx, async (root) => {
        const a = parseArgs(ctx.args, {
          bool: ["--remotes", "--all"],
          alias: { "-r": "--remotes", "-a": "--all" },
        });
        if (a.positional.length) return fail("usage: git-branch-list [--remotes|--all]");
        const patterns = a.flags.has("--all")
          ? ["refs/heads", "refs/remotes"]
          : a.flags.has("--remotes")
            ? ["refs/remotes"]
            : ["refs/heads"];
        const r = await runGit(root, [
          "for-each-ref",
          "--format=%(HEAD)%09%(refname)%09%(objectname:short)%09%(upstream:short)%09%(upstream:track)",
          ...patterns,
        ]);
        if (r.code !== 0) return gitFail(r, "git for-each-ref");
        const current = await currentBranch(root);
        const branches = r.stdout
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [head = "", ref = "", sha = "", upstream = "", track = ""] = line.split("\t");
            const remote = ref.startsWith("refs/remotes/");
            return {
              name: remote ? ref.slice("refs/remotes/".length) : ref.replace(/^refs\/heads\//, ""),
              ref,
              remote,
              sha,
              upstream: upstream || null,
              track: track || null,
              current: head === "*",
            };
          });
        const message = branches
          .map(
            (b) =>
              `${b.current ? "*" : " "} ${b.name} ${b.sha}` +
              (b.upstream ? ` [${b.upstream}${b.track ? `: ${b.track.replace(/^\[|\]$/g, "")}` : ""}]` : ""),
          )
          .join("\n");
        return ok(
          { current, detached: current === null, branches },
          message ? `${message}\n` : "(no branches)\n",
        );
      }),
  },
  {
    name: "git-branch-create",
    description:
      'Create a branch from HEAD (or --from <ref>) and switch to it (--no-switch to only create). Never resets an existing branch; never overwrites ignored local files such as .env* / keystores (SAFE-2). dangerous + minTier=code. Args: <name> [--from <ref>] [--no-switch]. e.g. ["feat/issue-82"]',
    dangerous: true,
    minTier: 2,
    handler: (ctx) =>
      inRepo(ctx, async (root) => {
        const a = parseArgs(ctx.args, {
          value: ["--from", "--name"],
          bool: ["--no-switch"],
          refuse: BRANCH_REFUSE,
        });
        const name = a.values.get("--name") ?? a.positional[0];
        const extra = a.values.has("--name") ? a.positional : a.positional.slice(1);
        if (!name || extra.length) {
          return fail("usage: git-branch-create <name> [--from <ref>] [--no-switch]");
        }
        if (!/^[A-Za-z0-9]/.test(name) || name.includes("@{")) {
          return fail(`invalid branch name: ${name}`);
        }
        const chk = await runGit(root, ["check-ref-format", "--branch", name]);
        if (chk.code !== 0 || chk.stdout.trim() !== name) {
          return fail(`invalid branch name: ${name}`);
        }
        const exists = await runGit(root, ["rev-parse", "--verify", "-q", `refs/heads/${name}`]);
        if (exists.code === 0) {
          return fail(
            `refused: branch '${name}' already exists (git-branch-create never resets or moves an existing branch)`,
          );
        }
        const from = a.values.get("--from");
        if (from !== undefined) {
          if (!isSafeRev(from)) return fail(`invalid start point: ${from}`);
          const v = await runGit(root, ["rev-parse", "--verify", "-q", `${from}^{commit}`]);
          if (v.code !== 0) return fail(`unknown start point: ${from}`);
        }
        const noSwitch = a.flags.has("--no-switch");
        const start = from !== undefined ? [from] : [];
        // --no-overwrite-ignore (SAFE-2): never replace an ignored local file
        // (.env*, keystores, …) with the start point's tracked copy — ignored
        // files are not in git, so such an overwrite could not be undone.
        const argv = noSwitch
          ? ["branch", "--no-track", name, ...start]
          : ["switch", "--no-track", "--no-overwrite-ignore", "-c", name, ...start];
        const r = await runGit(root, argv, { timeoutMs: GIT_WRITE_TIMEOUT_MS });
        if (r.code !== 0) {
          if (!noSwitch && /would be overwritten/.test(r.stderr)) {
            return fail(
              `refused (SAFE-2): switching to ${from ?? "HEAD"} would overwrite local untracked or ignored files; ` +
                `nothing was changed: ${scrubGitOutput(r.stderr.trim())}`,
              2,
            );
          }
          return gitFail(r, noSwitch ? "git branch" : "git switch");
        }
        const sha = await runGit(root, ["rev-parse", "--verify", "-q", `refs/heads/${name}`]);
        return ok(
          {
            branch: name,
            from: from ?? "HEAD",
            sha: sha.code === 0 ? sha.stdout.trim() : null,
            switched: !noSwitch,
          },
          `${noSwitch ? "Created" : "Created and switched to"} branch ${name}\n`,
        );
      }),
  },
  {
    name: "git-commit",
    description:
      'Commit explicit file paths only (git add, then commit just those paths; clamped to the worktree). Message required; no amend, no --all, no directories. Refuses .env* / keystore / .git paths and staging the deletion of protected infra (SAFE-2). Reports filesChanged. dangerous + minTier=code. Args: --message <msg> <path...>. e.g. ["--message","feat: add parser","src/parse.ts","tests/parse.test.ts"]',
    dangerous: true,
    minTier: 2,
    handler: (ctx) =>
      inRepo(ctx, async (root) => {
        const a = parseArgs(ctx.args, {
          value: ["--message"],
          alias: { "-m": "--message" },
          refuse: COMMIT_REFUSE,
        });
        const message = a.values.get("--message");
        if (!message || !message.trim()) {
          return fail("usage: git-commit --message <msg> <path...> (a commit message is required)");
        }
        if (message.includes("\0")) return fail("commit message must not contain NUL");
        if (a.positional.length === 0) {
          return fail("usage: git-commit --message <msg> <path...> (at least one explicit file path)");
        }

        const rels: string[] = [];
        for (const p of a.positional) {
          const rel = clampRel(root, p);
          if (rel === ".") {
            return fail(`refused: '${p}' is the worktree root; git-commit stages explicit file paths only`);
          }
          let isDir = false;
          let exists = true;
          try {
            isDir = lstatSync(resolve(root, rel)).isDirectory();
          } catch {
            exists = false;
          }
          if (isDir) {
            return fail(`refused: '${p}' is a directory; git-commit stages explicit file paths only`);
          }
          let deleted = false;
          if (!exists) {
            const tracked = await runGit(root, ["ls-files", "-z", "--", rel]);
            const entries = tracked.stdout.split("\0").filter(Boolean);
            if (tracked.code !== 0 || entries.length === 0) {
              return fail(`path not found and not tracked: ${p}`);
            }
            if (!entries.includes(rel)) {
              return fail(`refused: '${p}' is a directory; git-commit stages explicit file paths only`);
            }
            deleted = true;
          }
          const refusal = stagingRefusal(rel, deleted);
          if (refusal) return fail(refusal, 2);
          if (!rels.includes(rel)) rels.push(rel);
        }

        const ignored = await runGit(root, ["check-ignore", "--", ...rels], {
          literalPathspecs: false,
        });
        if (ignored.code === 0) {
          const list = ignored.stdout.trim().split("\n").join(", ");
          return fail(`refused: ignored path(s) are never force-added: ${list}`);
        }
        if (ignored.code !== 1) return gitFail(ignored, "git check-ignore");

        const add = await runGit(root, ["add", "--", ...rels], { timeoutMs: GIT_WRITE_TIMEOUT_MS });
        if (add.code !== 0) return gitFail(add, "git add");
        // --only: commit just these paths even if other entries are staged.
        const commit = await runGit(root, ["commit", "--only", "-m", message, "--", ...rels], {
          timeoutMs: GIT_WRITE_TIMEOUT_MS,
        });
        if (commit.code !== 0) return gitFail(commit, "git commit");

        const sha = (await runGit(root, ["rev-parse", "HEAD"])).stdout.trim();
        const tree = await runGit(root, [
          "diff-tree",
          "--root",
          "--no-commit-id",
          "--name-only",
          "-r",
          "-z",
          "HEAD",
        ]);
        const filesChanged = tree.stdout.split("\0").filter(Boolean);
        const branch = await currentBranch(root);
        const subject = message.trim().split("\n")[0] ?? "";
        return ok(
          { commit: sha, short: sha.slice(0, 12), branch, subject, filesChanged },
          `[${branch ?? "detached"} ${sha.slice(0, 12)}] ${subject}\n${filesChanged.length} file(s) committed\n`,
        );
      }),
  },
  {
    name: "git-push",
    description:
      'Push the current branch to the same-named branch on a configured remote (default origin) and set upstream. Never force; no refspecs. The remote OWNER/REPO must pass the GitHub repo gate (GITHUB-6); credentials only from env / credential helper. dangerous + minTier=code. Args: [--remote <name>]. e.g. [] or ["--remote","origin"]',
    dangerous: true,
    minTier: 2,
    // AUTONOMY-9: a push to the remote's default branch waits for the owner's card + code.
    mustAsk: gitPushMustAsk,
    handler: (ctx) =>
      inRepo(ctx, async (root) => {
        const a = parseArgs(ctx.args, {
          value: ["--remote", "--repo"],
          bool: ["--set-upstream"],
          alias: { "-u": "--set-upstream", "-R": "--repo" },
          refuse: PUSH_REFUSE,
        });
        for (const p of a.positional) {
          if (p.startsWith("+") || p.includes(":")) return fail(`${NO_FORCE} (refspec '${p}')`, 2);
        }
        if (a.positional.length > 2) return fail("usage: git-push [--remote <name>]");
        const branch = await currentBranch(root);
        if (!branch) {
          return fail("refused: HEAD is detached; git-push pushes the current branch only", 2);
        }
        const wanted = a.positional[1];
        if (wanted !== undefined && wanted !== branch) {
          return fail(`refused: git-push pushes the current branch only ('${branch}', not '${wanted}')`, 2);
        }
        const remoteFlag = a.values.get("--remote");
        if (remoteFlag !== undefined && a.positional[0] !== undefined && a.positional[0] !== remoteFlag) {
          return fail("usage: git-push [--remote <name>] (remote given twice)");
        }
        const remote = remoteFlag ?? a.positional[0] ?? "origin";
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(remote)) {
          return fail(`refused: '${redactUrlCredentials(remote)}' is not a configured remote name (URLs are not accepted)`, 2);
        }
        const urls = await runGit(root, ["remote", "get-url", "--push", "--all", remote]);
        const pushUrls = urls.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
        if (urls.code !== 0 || pushUrls.length === 0) return fail(`unknown remote: ${remote}`);

        // GITHUB-6: every push URL's OWNER/REPO must pass the repo gate (file + env; deny wins).
        // A malformed / unreadable allowlist file refuses (fail closed), never env-only.
        const loaded = await tryLoadAllowlist({ env: process.env });
        if (!loaded.ok) return fail(`GITHUB-6: refused — ${loaded.error}`, 3);
        const cfg = loaded.config;
        const repos: string[] = [];
        for (const url of pushUrls) {
          const slug = repoSlugFromRemoteUrl(url);
          if (!slug) {
            return fail(
              `GITHUB-6: cannot derive OWNER/REPO from the push URL of remote '${remote}' (${scrubGitOutput(url)})`,
              3,
            );
          }
          const gate = checkRepoGate(slug, cfg);
          if (!gate.ok) return fail(gate.error, 3);
          repos.push(slug);
        }
        const repoFlag = a.values.get("--repo");
        if (repoFlag && !repos.some((r) => r.toLowerCase() === repoFlag.toLowerCase())) {
          return fail(`refused: --repo ${repoFlag} does not match remote '${remote}' (${repos.join(", ")})`, 3);
        }

        const ref = `refs/heads/${branch}`;
        const r = await runGit(
          root,
          [
            "push",
            "--porcelain",
            "--set-upstream",
            "--no-follow-tags",
            "--recurse-submodules=no",
            remote,
            `${ref}:${ref}`,
          ],
          { timeoutMs: GIT_WRITE_TIMEOUT_MS },
        );
        const results = parsePushPorcelain(r.stdout);
        const mine = results.find((x) => x.from === ref) ?? results[0] ?? null;
        const output = scrubGitOutput([r.stdout.trim(), r.stderr.trim()].filter(Boolean).join("\n"));
        const data = { remote, repo: repos[0], repos, branch, ref, result: mine, output };
        if (r.code !== 0 || mine?.flag === "!") {
          return fail(
            `git push was rejected or failed (force is never used; integrate upstream changes another way): ${output}`,
            1,
            data,
          );
        }
        const status = mine?.flag === "=" ? "up-to-date" : mine?.flag === "*" ? "created" : "updated";
        return ok({ ...data, status }, `Pushed ${branch} to ${remote} (${repos[0]}): ${status}\n`);
      }),
  },
];

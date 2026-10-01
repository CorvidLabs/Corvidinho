/**
 * GITHUB-9 test helpers: a temp git repo whose branch is pushed to a local
 * bare `origin` (so a dry-run `github-pr-create` can read the branch's tree
 * with `git ls-remote`, no network), and a finished second-model review
 * cycle seeded in the test data dir's shared DB for an exact tree.
 */

import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { openCorvidinhoDb } from "../../src/store/db.ts";
import { recordReviewRound, type ReviewEnd } from "../../src/work/review.ts";

/** `git` in `cwd` without the caller's repo-locating env; throws on failure. */
export function git(cwd: string, ...args: string[]): string {
  return gitWith(cwd, {}, ...args);
}

function gitWith(cwd: string, extra: Record<string, string>, ...args: string[]): string {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined || k === "GIT_DIR" || k === "GIT_WORK_TREE" || k === "GIT_INDEX_FILE") continue;
    env[k] = v;
  }
  env.GIT_CONFIG_NOSYSTEM = "1";
  Object.assign(env, extra);
  const r = Bun.spawnSync(["git", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr.toString()}`);
  return r.stdout.toString();
}

export type ReviewRepo = {
  /** The checkout (repo top level), on `branch`. */
  dir: string;
  /** The bare `origin`. */
  bare: string;
  branch: string;
};

/**
 * A repo on `main` (one commit, pushed to a bare `origin` at
 * `…/<slug>.git`, default `acme/review-fixture`, with `origin/HEAD`), then
 * `branch` checked out with one more commit that adds `src/app.ts` — pushed
 * when `push` (default true).
 */
export function makeReviewRepo(opts: { branch?: string; push?: boolean; slug?: string } = {}): ReviewRepo {
  const base = mkdtempSync(join(tmpdir(), "corvidinho-review-repo-"));
  const dir = join(base, "work");
  mkdirSync(dir);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.name", "Review Fixture");
  git(dir, "config", "user.email", "review@example.invalid");
  writeFileSync(join(dir, "README.md"), "hello\n");
  git(dir, "add", "README.md");
  git(dir, "commit", "-q", "-m", "init");
  // The bare remote's path ends in OWNER/REPO.git, so git-push's GITHUB-6
  // gate reads that slug from it.
  const [owner, name] = (opts.slug ?? "acme/review-fixture").split("/");
  const bare = join(base, owner!, `${name}.git`);
  mkdirSync(bare, { recursive: true });
  git(bare, "init", "-q", "--bare");
  git(dir, "remote", "add", "origin", bare);
  git(dir, "push", "-q", "origin", "main");
  git(dir, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
  const branch = opts.branch ?? "feature/review";
  git(dir, "checkout", "-q", "-b", branch);
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src", "app.ts"), "export const answer = 41;\n");
  git(dir, "add", "src/app.ts");
  git(dir, "commit", "-q", "-m", "add app");
  if (opts.push !== false) git(dir, "push", "-q", "origin", branch);
  return { dir, bare, branch };
}

/** Commit everything in `dir` and push `branch` to origin. */
export function commitAndPush(dir: string, branch: string, message = "change"): void {
  git(dir, "add", "--all");
  git(dir, "commit", "-q", "-m", message);
  git(dir, "push", "-q", "origin", branch);
}

/**
 * The tree a commit of everything in `dir` (untracked, non-ignored files
 * included) would have — what `/work` commits — from a copy of the index,
 * the real one untouched.
 */
export function fullWorkTree(dir: string): string {
  const tmp = mkdtempSync(join(tmpdir(), "corvidinho-review-fixture-index-"));
  const index = join(tmp, "index");
  try {
    const real = git(dir, "rev-parse", "--git-path", "index").trim();
    copyFileSync(isAbsolute(real) ? real : join(dir, real), index);
    gitWith(dir, { GIT_INDEX_FILE: index }, "add", "--all");
    return gitWith(dir, { GIT_INDEX_FILE: index }, "write-tree").trim();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** The tree id of HEAD in `dir`. */
export function headTree(dir: string): string {
  return git(dir, "rev-parse", "HEAD^{tree}").trim();
}

/** Seed a finished one-round cycle for (repo, branch) at `tree` in the shared DB. */
export function seedFinishedReview(opts: {
  repo: string;
  branch: string;
  tree: string;
  reviewer?: string;
  findings?: string[];
  ended?: ReviewEnd;
}): void {
  const db = openCorvidinhoDb({ env: process.env });
  try {
    recordReviewRound(db, {
      repo: opts.repo,
      branch: opts.branch,
      cycle: Date.now(),
      round: 1,
      tree: opts.tree,
      reviewer: opts.reviewer ?? "anthropic:reviewer-fixture",
      authors: ["author-fixture"],
      findings: opts.findings ?? [],
      dropped: 0,
      changed: null,
      ended: opts.ended ?? "clean",
      createdAt: Date.now(),
    });
  } finally {
    db.close();
  }
}

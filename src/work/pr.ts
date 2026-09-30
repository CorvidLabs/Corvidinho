/**
 * /work → draft PR (issue #88, REQ-discord-088).
 *
 * After a /work run finishes in its git worktree (AUTONOMOUS-3), ship the
 * branch as a draft pull request (GITHUB-2), but only when:
 *
 * - the run finished cleanly and the tree passed the project verify lane
 *   (AGENT-4): trusted from the run's result frame, else re-run once here;
 * - the operator allowed the PR path: `git-commit` (only when the tree is
 *   dirty), `git-push` and `github-pr-create` are allowlisted for
 *   non-interactive use (GITHUB-5 / SAFE-1). Nothing is committed or pushed
 *   unless every step it needs is allowed;
 * - the remote OWNER/REPO passes the repo gate (GITHUB-6).
 *
 * The steps go through the existing typed plugins via `runPlugin`, so each
 * dangerous action keeps its SAFE-1 deny and SAFE-5 audit row. Otherwise the
 * caller gets one plain line saying why no PR was opened. Never throws.
 */

import { runGit, type GitRun } from "../../plugins/git/exec.ts";
import {
  parseNameStatusZ,
  parseStatusPorcelainZ,
  repoSlugFromRemoteUrl,
} from "../../plugins/git/parse.ts";
import { defaultVerifyRunner } from "../agent/verify.ts";
import type { VerifyRunner } from "../agent/types.ts";
import { loadBuiltins } from "../plugins/builtins.ts";
import { allowlistFromEnv } from "../plugins/env.ts";
import { checkRepoGateAsync, type RepoGateResult } from "../plugins/githubDeny.ts";
import { runPlugin, type RunOptions } from "../plugins/run.ts";
import type { PluginHandlerResult } from "../plugins/types.ts";
import { scrubSecrets } from "../store/scrub.ts";
import { resolveBase } from "../worktree/base.ts";
import {
  buildWorkPrBody,
  workCommitMessage,
  workPrTitle,
  type WorkPrVerifySource,
} from "./pr-body.ts";

/** Plugins the PR path runs; each must be allowlisted (GITHUB-5). */
export const WORK_PR_PLUGINS = ["git-commit", "git-push", "github-pr-create"] as const;

/** Verify facts from the run's `result` frame (absent when none parsed). */
export type WorkRunFacts = {
  verified: boolean;
  verifySkipped: boolean;
  state?: string;
};

export type WorkRunOutcome = {
  ok: boolean;
  exitCode: number;
  task?: WorkRunFacts;
};

export type OpenWorkPrInput = {
  /** Active worktree root; undefined when the work did not get one. */
  worktreePath?: string;
  branch?: string;
  taskId: string;
  description: string;
  run: WorkRunOutcome;
};

export type WorkPrSkipReason =
  | "run-failed"
  | "needs-input"
  | "verify-failed"
  | "no-worktree"
  | "no-changes"
  | "conflicts"
  | "no-base"
  | "wrong-branch"
  | "not-allowed"
  | "no-repo"
  | "repo-denied"
  | "commit-failed"
  | "push-failed"
  | "pr-failed"
  | "error";

export type WorkPrOutcome =
  | {
      opened: true;
      dryRun: boolean;
      url?: string;
      number?: number;
      repo: string;
      branch: string;
      base: string;
      verify: WorkPrVerifySource;
      line: string;
    }
  | { opened: false; reason: WorkPrSkipReason; line: string };

export type OpenWorkPrDeps = {
  runPlugin?: (opts: RunOptions) => Promise<PluginHandlerResult>;
  git?: (cwd: string, args: string[]) => Promise<GitRun>;
  verify?: VerifyRunner;
  allowlist?: ReadonlySet<string>;
  repoGate?: (repo: string) => RepoGateResult | Promise<RepoGateResult>;
  /** Remote to push to (default `origin`). */
  remote?: string;
};

export type WorkPrRunner = (input: OpenWorkPrInput) => Promise<WorkPrOutcome>;

const ERR_MAX = 300;

function skip(reason: WorkPrSkipReason, text: string): WorkPrOutcome {
  return { opened: false, reason, line: scrubSecrets(`PR: ${text}`) };
}

function errText(r: PluginHandlerResult): string {
  const e = (r.error ?? r.message ?? `exit ${r.exitCode ?? 1}`).trim();
  return e.length > ERR_MAX ? `${e.slice(0, ERR_MAX - 1)}…` : e;
}

async function defaultRunPlugin(opts: RunOptions): Promise<PluginHandlerResult> {
  loadBuiltins();
  return runPlugin(opts);
}

/**
 * Ship a finished /work worktree as a draft PR, or say plainly why not.
 * `deps` are injectable for fixture tests (plugins, git, verify lane).
 */
export async function openWorkPr(
  input: OpenWorkPrInput,
  deps: OpenWorkPrDeps = {},
): Promise<WorkPrOutcome> {
  try {
    return await ship(input, deps);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return skip("error", `not opened — ${msg.slice(0, ERR_MAX)}`);
  }
}

async function ship(input: OpenWorkPrInput, deps: OpenWorkPrDeps): Promise<WorkPrOutcome> {
  const { run } = input;
  if (!run.ok) {
    return skip(
      "run-failed",
      `not opened — the work run did not finish cleanly (exit ${run.exitCode}), so there is nothing verified to ship.`,
    );
  }
  // AUTONOMY-1 (REQ-discord-044): a run that stopped to ask a human is not
  // done, so there is nothing to ship yet.
  if (run.task?.state === "blocked") {
    return skip("needs-input", "not opened — the work run is waiting for your answer to its question.");
  }
  if (run.task && (run.task.state === "failed" || (!run.task.verified && !run.task.verifySkipped))) {
    return skip("verify-failed", "not opened — verification failed in the work run.");
  }
  const cwd = input.worktreePath;
  const branch = input.branch;
  if (!cwd || !branch) {
    return skip("no-worktree", "not opened — this work did not run in a git worktree.");
  }

  const git = deps.git ?? ((c: string, a: string[]) => runGit(c, a));
  const remote = deps.remote ?? "origin";

  const st = await git(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (st.code !== 0) {
    return skip("error", "not opened — could not read the worktree status.");
  }
  const status = parseStatusPorcelainZ(st.stdout);
  if (status.conflicted.length > 0) {
    return skip("conflicts", "not opened — the worktree has merge conflicts.");
  }
  const dirty = status.entries.length > 0;

  const based = await resolveBase(git, cwd, remote);
  if (!based) {
    return skip("no-base", `not opened — cannot find the base branch on \`${remote}\` to compare against.`);
  }
  const { base, mergeBase } = based;
  // Push only the work branch — never the base or whatever the agent checked
  // out instead (git-push pushes the current branch).
  const headRef = await git(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const current = headRef.code === 0 ? headRef.stdout.trim() : "";
  if (current !== branch || current === base) {
    return skip(
      "wrong-branch",
      `not opened — the worktree is on \`${current || "a detached HEAD"}\`, not the work branch \`${branch}\`.`,
    );
  }
  const count = await git(cwd, ["rev-list", "--count", `${mergeBase}..HEAD`]);
  const ahead = count.code === 0 ? Number(count.stdout.trim()) || 0 : 0;
  if (!dirty && ahead === 0) {
    return skip("no-changes", "none — the work left no changes in its worktree.");
  }

  // GITHUB-5: every dangerous step must be allowed before any of them runs.
  const allow = deps.allowlist ?? allowlistFromEnv();
  const needed = WORK_PR_PLUGINS.filter((n) => dirty || n !== "git-commit");
  const missing = needed.filter((n) => !allow.has(n));
  if (missing.length > 0) {
    return skip(
      "not-allowed",
      `not opened — opening a PR from /work needs an explicit allow (GITHUB-5): allowlist ${missing.join(", ")} (CORVIDINHO_ALLOWLIST). The changes stay on branch \`${branch}\`.`,
    );
  }

  const url = await git(cwd, ["remote", "get-url", "--push", remote]);
  const slug = url.code === 0 ? repoSlugFromRemoteUrl(url.stdout.split("\n")[0] ?? "") : null;
  if (!slug) {
    return skip("no-repo", `not opened — cannot tell the GitHub OWNER/REPO from remote \`${remote}\`.`);
  }
  const gate = await (deps.repoGate ?? checkRepoGateAsync)(slug);
  if (!gate.ok) {
    return skip("repo-denied", `not opened — ${gate.error}`);
  }

  // AGENT-4: ship only a tree that passed the verify lane.
  let verify: WorkPrVerifySource = "run";
  if (run.task?.verified !== true) {
    const runner = deps.verify ?? defaultVerifyRunner;
    let passed = false;
    try {
      passed = (await runner(cwd)).success;
    } catch {
      passed = false;
    }
    if (!passed) {
      return skip(
        "verify-failed",
        `not opened — the verify lane failed on the work tree (fledge lanes run verify --non-interactive). The changes stay on branch \`${branch}\`.`,
      );
    }
    verify = "pre-push";
  }

  const call = deps.runPlugin ?? defaultRunPlugin;
  const common = { cwd, nonInteractive: true, allowlist: allow } as const;

  if (dirty) {
    const paths: string[] = [];
    for (const e of status.entries) {
      for (const p of e.origPath ? [e.origPath, e.path] : [e.path]) {
        if (!paths.includes(p)) paths.push(p);
      }
    }
    const committed = await call({
      ...common,
      name: "git-commit",
      args: ["--message", workCommitMessage(input.description, input.taskId), "--", ...paths],
    });
    if (!committed.ok) {
      return skip("commit-failed", `not opened — commit failed: ${errText(committed)}`);
    }
  }

  const pushed = await call({ ...common, name: "git-push", args: ["--remote", remote] });
  if (!pushed.ok) {
    return skip("push-failed", `not opened — push failed: ${errText(pushed)}`);
  }

  const ns = await git(cwd, ["diff", "--name-status", "-z", "--no-ext-diff", mergeBase, "HEAD"]);
  const stat = await git(cwd, ["diff", "--stat=100", "--no-color", "--no-ext-diff", mergeBase, "HEAD"]);
  const log = await git(cwd, [
    "log",
    "--max-count=50",
    "--no-color",
    "--format=%h %s",
    `${mergeBase}..HEAD`,
  ]);
  const body = buildWorkPrBody({
    taskId: input.taskId,
    description: input.description,
    branch,
    base,
    files: ns.code === 0 ? parseNameStatusZ(ns.stdout) : [],
    diffstat: stat.code === 0 ? stat.stdout : "",
    commits: log.code === 0 ? log.stdout.split("\n").filter(Boolean) : [],
    verify,
  });

  const created = await call({
    ...common,
    name: "github-pr-create",
    args: [
      "--repo",
      slug,
      "--title",
      workPrTitle(input.description),
      "--body",
      body,
      "--head",
      branch,
      "--base",
      base,
      "--draft",
    ],
  });
  if (!created.ok) {
    return skip(
      "pr-failed",
      `not opened — branch \`${branch}\` was pushed, but opening the PR failed: ${errText(created)}`,
    );
  }
  const data = (created.data ?? {}) as { url?: unknown; number?: unknown; dryRun?: unknown };
  const prUrl = typeof data.url === "string" ? data.url : undefined;
  const number = typeof data.number === "number" ? data.number : undefined;
  const dryRun = data.dryRun === true;
  const where = `\`${branch}\` into \`${base}\` on ${slug}`;
  const line = dryRun
    ? `PR: dry run — would open a draft PR from ${where}.`
    : `PR: opened draft ${prUrl ?? (number !== undefined ? `#${number}` : "")} (${where}).`;
  return {
    opened: true,
    dryRun,
    url: prUrl,
    number,
    repo: slug,
    branch,
    base,
    verify,
    line: scrubSecrets(line),
  };
}

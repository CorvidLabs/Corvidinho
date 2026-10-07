import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { list } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";
import {
  isCorvidinhoRepoSlug,
  mergeOwnGreenPr,
  MERGE_CI_NOT_GREEN,
  MERGE_NOT_MERGEABLE,
  MERGE_NOT_OWN,
  MERGE_OUTSIDE_CORVIDINHO,
  type MergeOctokit,
} from "../plugins/github/merge.ts";
import { CORVIDINHO_REPO } from "../src/agent/repo-ways.ts";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const NO_ALLOWLIST = join(mkdtempSync(join(tmpdir(), "corvidinho-gh-merge-")), "no-allowlist.toml");

const allowEnv = {
  CORVIDINHO_GITHUB_ALLOW_REPOS: "CorvidLabs/Corvidinho,acme/other",
  CORVIDINHO_ALLOWLIST_FILE: NO_ALLOWLIST,
};

function withEnv(extra: Record<string, string>, fn: () => Promise<void>) {
  const prev: Record<string, string | undefined> = {};
  const keys: Record<string, string> = { ...allowEnv, ...extra };
  for (const k of Object.keys(keys)) {
    prev[k] = process.env[k];
    process.env[k] = keys[k]!;
  }
  return fn().finally(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

type PullShape = {
  number: number;
  title: string;
  html_url: string;
  state: string;
  draft?: boolean | null;
  mergeable: boolean | null;
  user: { login: string; id: number } | null;
  head: { sha: string; ref: string };
  base: { ref: string };
};

function basePull(over: Partial<PullShape> = {}): PullShape {
  return {
    number: 99,
    title: "GITHUB-7",
    html_url: "https://github.com/CorvidLabs/Corvidinho/pull/99",
    state: "open",
    draft: false,
    mergeable: true,
    user: { login: "corvid-agent", id: 95454608 },
    head: { sha: SHA, ref: "feat/x" },
    base: { ref: "main" },
    ...over,
  };
}

function fakeMergeOctokit(opts: {
  login?: string;
  pull?: PullShape;
  pullError?: Error;
  authError?: Error;
  ciRuns?: Array<{ name: string; status: string; conclusion: string | null; html_url: string | null }>;
  mergeResult?: { merged: boolean; message: string; sha: string };
  mergeError?: Error;
}): { octokit: MergeOctokit; calls: string[] } {
  const calls: string[] = [];
  const runs = opts.ciRuns ?? [
    { name: "ci", status: "completed", conclusion: "success", html_url: "https://example.test/ci" },
  ];
  const octokit = {
    rest: {
      users: {
        async getAuthenticated() {
          calls.push("users.getAuthenticated");
          if (opts.authError) throw opts.authError;
          return { data: { login: opts.login ?? "corvid-agent", id: 95454608 } };
        },
      },
      pulls: {
        async get(params: { owner: string; repo: string; pull_number: number }) {
          calls.push(`pulls.get:${params.owner}/${params.repo}#${params.pull_number}`);
          if (opts.pullError) throw opts.pullError;
          return { data: opts.pull ?? basePull() };
        },
        async merge(params: {
          owner: string;
          repo: string;
          pull_number: number;
          merge_method?: string;
          commit_title?: string;
          commit_message?: string;
        }) {
          calls.push(
            `pulls.merge:${params.owner}/${params.repo}#${params.pull_number}:${params.merge_method ?? ""}`,
          );
          // Guard: never accept admin-like fields from callers of this fake.
          expect((params as { admin?: unknown }).admin).toBeUndefined();
          if (opts.mergeError) throw opts.mergeError;
          return {
            data: opts.mergeResult ?? {
              merged: true,
              message: "Pull Request successfully merged",
              sha: SHA,
            },
          };
        },
      },
      checks: {
        async listForRef(params: { ref: string; page: number }) {
          calls.push(`checks.listForRef:${params.ref}:p${params.page}`);
          if (params.page > 1) {
            return { data: { total_count: runs.length, check_runs: [] } };
          }
          return { data: { total_count: runs.length, check_runs: runs } };
        },
      },
      repos: {
        async getCommit() {
          return { data: { sha: SHA } };
        },
        async getCombinedStatusForRef(params: { page: number }) {
          if (params.page > 1) {
            return { data: { sha: SHA, total_count: 0, statuses: [] } };
          }
          return { data: { sha: SHA, total_count: 0, statuses: [] } };
        },
      },
    },
  } as unknown as MergeOctokit;
  return { octokit, calls };
}

describe("isCorvidinhoRepoSlug (GITHUB-7)", () => {
  test("matches CorvidLabs/Corvidinho case-insensitively", () => {
    expect(isCorvidinhoRepoSlug("CorvidLabs", "Corvidinho")).toBe(true);
    expect(isCorvidinhoRepoSlug("corvidlabs", "corvidinho")).toBe(true);
    expect(isCorvidinhoRepoSlug("acme", "widget")).toBe(false);
    expect(isCorvidinhoRepoSlug("CorvidLabs", "other")).toBe(false);
  });
});

describe("mergeOwnGreenPr (GITHUB-7)", () => {
  test("merges own green Corvidinho PR via squash (no admin)", async () => {
    const { octokit, calls } = fakeMergeOctokit({});
    const r = await mergeOwnGreenPr(octokit, {
      owner: "CorvidLabs",
      repo: "Corvidinho",
      pull_number: 99,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.merged).toBe(true);
    expect(r.sha).toBe(SHA);
    expect(r.mergeMethod).toBe("squash");
    expect(r.author).toBe("corvid-agent");
    expect(r.ci.verdict).toBe("green");
    expect(calls.some((c) => c.startsWith("pulls.merge:"))).toBe(true);
    expect(calls.find((c) => c.startsWith("pulls.merge:"))).toContain(":squash");
  });

  test("dry-run passes guards and does not call pulls.merge", async () => {
    const { octokit, calls } = fakeMergeOctokit({});
    const r = await mergeOwnGreenPr(octokit, {
      owner: "CorvidLabs",
      repo: "Corvidinho",
      pull_number: 99,
      dryRun: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dryRun).toBe(true);
    expect(r.merged).toBe(false);
    expect(calls.some((c) => c.startsWith("pulls.merge:"))).toBe(false);
  });

  test("refuses outside Corvidinho", async () => {
    const { octokit, calls } = fakeMergeOctokit({});
    const r = await mergeOwnGreenPr(octokit, {
      owner: "acme",
      repo: "widget",
      pull_number: 1,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.exitCode).toBe(2);
    expect(r.error).toContain(MERGE_OUTSIDE_CORVIDINHO);
    expect(calls.length).toBe(0);
  });

  test("refuses someone else's PR", async () => {
    const { octokit } = fakeMergeOctokit({
      login: "corvid-agent",
      pull: basePull({ user: { login: "0xLeif", id: 1 } }),
    });
    const r = await mergeOwnGreenPr(octokit, {
      owner: "CorvidLabs",
      repo: "Corvidinho",
      pull_number: 99,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.exitCode).toBe(2);
    expect(r.error).toContain(MERGE_NOT_OWN);
  });

  test("refuses when CI is not green", async () => {
    const { octokit } = fakeMergeOctokit({
      ciRuns: [
        { name: "ci", status: "completed", conclusion: "failure", html_url: "https://example.test/ci" },
      ],
    });
    const r = await mergeOwnGreenPr(octokit, {
      owner: "CorvidLabs",
      repo: "Corvidinho",
      pull_number: 99,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.exitCode).toBe(2);
    expect(r.error).toContain(MERGE_CI_NOT_GREEN);
    expect(r.error).toContain("verdict=red");
  });

  test("refuses draft / not mergeable / closed", async () => {
    for (const pull of [
      basePull({ draft: true }),
      basePull({ mergeable: false }),
      basePull({ mergeable: null }),
      basePull({ state: "closed" }),
    ]) {
      const { octokit, calls } = fakeMergeOctokit({ pull });
      const r = await mergeOwnGreenPr(octokit, {
        owner: "CorvidLabs",
        repo: "Corvidinho",
        pull_number: 99,
      });
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.exitCode).toBe(2);
      expect(r.error).toContain(MERGE_NOT_MERGEABLE);
      expect(calls.some((c) => c.startsWith("pulls.merge:"))).toBe(false);
    }
  });

  test("surfaces GitHub merge API errors (branch protection) without bypass", async () => {
    const { octokit } = fakeMergeOctokit({
      mergeError: new Error("Required status check \"ci\" is expected."),
    });
    const r = await mergeOwnGreenPr(octokit, {
      owner: "CorvidLabs",
      repo: "Corvidinho",
      pull_number: 99,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("Required status check");
  });
});

describe("github-pr-merge plugin (GITHUB-7)", () => {
  test("listed as dangerous minTier 1", () => {
    loadBuiltins();
    const entry = list().find((e) => e.name === "github-pr-merge");
    expect(entry).toBeDefined();
    expect(entry!.dangerous).toBe(true);
    expect(entry!.minTier).toBe(1);
  });

  test("non-interactive without CORVIDINHO_ALLOWLIST denies (SAFE-1)", async () => {
    loadBuiltins();
    await withEnv({ CORVIDINHO_GITHUB_DRY_RUN: "1" }, async () => {
      const r = await runPlugin({
        name: "github-pr-merge",
        args: ["99", "--repo", CORVIDINHO_REPO],
        nonInteractive: true,
        allowlist: [],
      });
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(2);
      expect(r.error).toContain("SAFE-1");
    });
  });

  test("refuses outside Corvidinho before Octokit (GITHUB-7)", async () => {
    loadBuiltins();
    await withEnv({ CORVIDINHO_GITHUB_DRY_RUN: "1" }, async () => {
      const r = await runPlugin({
        name: "github-pr-merge",
        args: ["1", "--repo", "acme/other"],
        nonInteractive: true,
        allowlist: ["github-pr-merge"],
      });
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(2);
      expect(r.error).toContain(MERGE_OUTSIDE_CORVIDINHO);
    });
  });

  test("usage error when PR number missing", async () => {
    loadBuiltins();
    await withEnv({ CORVIDINHO_GITHUB_DRY_RUN: "1" }, async () => {
      const r = await runPlugin({
        name: "github-pr-merge",
        args: ["--repo", CORVIDINHO_REPO],
        nonInteractive: true,
        allowlist: ["github-pr-merge"],
      });
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(1);
      expect(r.error).toContain("usage: github-pr-merge");
    });
  });
});

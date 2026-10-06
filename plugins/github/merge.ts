/**
 * GITHUB-7: merge the authenticated bot's own green PR on Corvidinho only.
 * Guards run before Octokit pulls.merge; never admin/bypass. Pure helpers take
 * an Octokit-shaped client so tests pass a fake without network or tokens.
 */

import { CORVIDINHO_REPO } from "../../src/agent/repo-ways.ts";
import { fetchCiStatus, type CiOctokit, type CiStatusData } from "./ciStatus.ts";

export const MERGE_OUTSIDE_CORVIDINHO =
  "refused (GITHUB-7): outside Corvidinho a human still merges; " +
  `github-pr-merge only merges on ${CORVIDINHO_REPO}`;

export const MERGE_NOT_OWN =
  "refused (GITHUB-7): never merges someone else's PR; " +
  "author must be the authenticated bot identity";

export const MERGE_CI_NOT_GREEN =
  "refused (GITHUB-7): CI must be green before merge";

export const MERGE_NOT_MERGEABLE =
  "refused (GITHUB-7): PR is not mergeable (open, not draft, mergeable=true)";

export type MergeMethod = "merge" | "squash" | "rebase";

/** Octokit slice for merge guards + pulls.merge (satisfies CiOctokit for fetchCiStatus). */
export type MergeOctokit = {
  rest: {
    users: {
      getAuthenticated(): Promise<{ data: { login: string; id: number } }>;
    };
    pulls: {
      get(params: {
        owner: string;
        repo: string;
        pull_number: number;
      }): Promise<{
        data: {
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
      }>;
      merge(params: {
        owner: string;
        repo: string;
        pull_number: number;
        merge_method?: MergeMethod;
        commit_title?: string;
        commit_message?: string;
      }): Promise<{
        data: {
          merged: boolean;
          message: string;
          sha: string;
        };
      }>;
    };
    checks: CiOctokit["rest"]["checks"];
    repos: CiOctokit["rest"]["repos"];
  };
};

export type MergeOk = {
  ok: true;
  dryRun?: boolean;
  number: number;
  title: string;
  url: string;
  sha: string | null;
  merged: boolean;
  message: string;
  author: string;
  mergeMethod: MergeMethod;
  ci: { verdict: CiStatusData["verdict"]; sha: string | null };
};

export type MergeFail = {
  ok: false;
  error: string;
  exitCode: number;
};

export type MergeResult = MergeOk | MergeFail;

/** True when OWNER/REPO is CorvidLabs/Corvidinho (case-insensitive). */
export function isCorvidinhoRepoSlug(owner: string, repo: string): boolean {
  return `${owner}/${repo}`.toLowerCase() === CORVIDINHO_REPO.toLowerCase();
}

export type MergeParams = {
  owner: string;
  repo: string;
  pull_number: number;
  merge_method?: MergeMethod;
  dryRun?: boolean;
  /** Optional commit title/message for squash/merge commits. */
  commit_title?: string;
  commit_message?: string;
};

/**
 * Guard then (unless dryRun) call pulls.merge with no admin/bypass fields.
 * Caller must already have passed GITHUB-6 / SAFE-1 / role gates.
 */
export async function mergeOwnGreenPr(
  octokit: MergeOctokit,
  params: MergeParams,
): Promise<MergeResult> {
  const { owner, repo, pull_number } = params;
  if (!isCorvidinhoRepoSlug(owner, repo)) {
    return { ok: false, error: MERGE_OUTSIDE_CORVIDINHO, exitCode: 2 };
  }
  if (!Number.isFinite(pull_number) || pull_number < 1) {
    return {
      ok: false,
      error: "PR selector must be a positive number",
      exitCode: 1,
    };
  }

  const method: MergeMethod =
    params.merge_method === "merge" || params.merge_method === "rebase"
      ? params.merge_method
      : "squash";

  let login: string;
  try {
    const me = await octokit.rest.users.getAuthenticated();
    login = (me.data.login || "").trim();
    if (!login) {
      return {
        ok: false,
        error: "refused (GITHUB-7): could not read authenticated GitHub login",
        exitCode: 1,
      };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, exitCode: 1 };
  }

  let pull: Awaited<ReturnType<MergeOctokit["rest"]["pulls"]["get"]>>["data"];
  try {
    const res = await octokit.rest.pulls.get({ owner, repo, pull_number });
    pull = res.data;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, exitCode: 1 };
  }

  const author = (pull.user?.login || "").trim();
  if (!author || author.toLowerCase() !== login.toLowerCase()) {
    return {
      ok: false,
      error: `${MERGE_NOT_OWN} (PR #${pull_number} author=${author || "(none)"}, authenticated=${login})`,
      exitCode: 2,
    };
  }

  const open = pull.state.toLowerCase() === "open";
  const draft = pull.draft === true;
  const mergeable = pull.mergeable === true;
  if (!open || draft || !mergeable) {
    const why = !open
      ? `state=${pull.state}`
      : draft
        ? "draft"
        : `mergeable=${pull.mergeable == null ? "UNKNOWN" : "false"}`;
    return {
      ok: false,
      error: `${MERGE_NOT_MERGEABLE} (${why})`,
      exitCode: 2,
    };
  }

  let ci: CiStatusData;
  try {
    ci = await fetchCiStatus(octokit as CiOctokit, {
      owner,
      repo,
      target: { kind: "pr", number: pull_number },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, exitCode: 1 };
  }
  if (ci.verdict !== "green") {
    return {
      ok: false,
      error: `${MERGE_CI_NOT_GREEN} (verdict=${ci.verdict})`,
      exitCode: 2,
    };
  }

  if (params.dryRun) {
    return {
      ok: true,
      dryRun: true,
      number: pull.number,
      title: pull.title,
      url: pull.html_url,
      sha: null,
      merged: false,
      message: "dry-run: would merge (GITHUB-7 guards passed)",
      author,
      mergeMethod: method,
      ci: { verdict: ci.verdict, sha: ci.sha },
    };
  }

  try {
    // No admin / bypass fields — branch protection, reviews, CODEOWNERS enforce.
    const res = await octokit.rest.pulls.merge({
      owner,
      repo,
      pull_number,
      merge_method: method,
      ...(params.commit_title ? { commit_title: params.commit_title } : {}),
      ...(params.commit_message ? { commit_message: params.commit_message } : {}),
    });
    return {
      ok: true,
      number: pull.number,
      title: pull.title,
      url: pull.html_url,
      sha: res.data.sha ?? null,
      merged: res.data.merged === true,
      message: res.data.message || "merged",
      author,
      mergeMethod: method,
      ci: { verdict: ci.verdict, sha: ci.sha },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, exitCode: 1 };
  }
}

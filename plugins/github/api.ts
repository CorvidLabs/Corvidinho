/**
 * Reviewed GitHub API client via Octokit (not shell `gh`).
 * Token from GITHUB_TOKEN or GH_TOKEN. Callers use typed plugin commands only.
 */

import { Octokit } from "@octokit/rest";

export type ApiResult<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
  exitCode: number;
};

export function getGithubToken(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const t = env.GITHUB_TOKEN || env.GH_TOKEN;
  return typeof t === "string" && t.length > 0 ? t : undefined;
}

export function createOctokit(env: NodeJS.ProcessEnv = process.env): Octokit | ApiResult {
  const token = getGithubToken(env);
  if (!token) {
    return {
      ok: false,
      error: "missing GITHUB_TOKEN or GH_TOKEN (Octokit; secrets stay out of the repo)",
      exitCode: 1,
    };
  }
  return new Octokit({ auth: token, userAgent: "corvidinho" });
}

export function splitOwnerRepo(repo: string): { owner: string; name: string } | null {
  const parts = repo.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], name: parts[1] };
}

/** Kept for fixture unit tests that parse sample JSON payloads. */
export function parseJsonStdout(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed);
}

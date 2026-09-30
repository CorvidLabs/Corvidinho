/**
 * IDENTITY-7.a — look a GitHub login up to its numeric user id, once, when
 * the owner links it (`/admin people link person:<id> github:<login>`, owner
 * only and audited in src/discord/command-handlers/admin.ts). On GitHub people
 * match only by that numeric id, never the login, so the id is what gets
 * stored (`github_ids`). Read-only: `GET /users/{login}` through Octokit, with
 * `GITHUB_TOKEN` / `GH_TOKEN` when set. Not a writer of people.
 */

import { Octokit } from "@octokit/rest";
import { normalizeGithubId, validGithubLogin } from "./people.ts";

/** A GitHub login looked up to its numeric user id (IDENTITY-7.a). */
export type GithubUserLookupResult =
  | { ok: true; id: string; login: string }
  | { ok: false; error: string };

/** Looks a (valid, lowercased) GitHub login up to its numeric user id. */
export type GithubUserLookup = (login: string) => Promise<GithubUserLookupResult>;

/** How long `/admin people link github:` waits for GitHub. */
export const GITHUB_USER_LOOKUP_TIMEOUT_MS = 10_000;

/**
 * IDENTITY-7.a — the GitHub API lookup `/admin people link github:<login>`
 * uses to store the login's numeric user id once (`GET /users/{login}`, with
 * `GITHUB_TOKEN` / `GH_TOKEN` when set). Errors carry the HTTP status only,
 * never the token or the response body.
 */
export function createGithubUserLookup(env: NodeJS.ProcessEnv = process.env): GithubUserLookup {
  const token = env.GITHUB_TOKEN?.trim() || env.GH_TOKEN?.trim() || undefined;
  return async (login) => {
    try {
      const octokit = new Octokit({ ...(token ? { auth: token } : {}), userAgent: "corvidinho" });
      const res = await octokit.rest.users.getByUsername({
        username: login,
        request: { signal: AbortSignal.timeout(GITHUB_USER_LOOKUP_TIMEOUT_MS) },
      });
      const id = normalizeGithubId(res.data.id);
      const got = validGithubLogin(res.data.login);
      if (!id || !got) return { ok: false, error: "GitHub returned no numeric user id" };
      return { ok: true, id, login: got };
    } catch (e) {
      const status = (e as { status?: unknown } | null)?.status;
      if (status === 404) return { ok: false, error: `GitHub has no user @${login}` };
      return {
        ok: false,
        error: typeof status === "number" ? `GitHub lookup failed (HTTP ${status})` : "GitHub lookup failed (no answer)",
      };
    }
  };
}

/**
 * ROLES-CHAT-8 — community (non-ADMIN) Discord sessions may use any *public*
 * GitHub repo; their site / roadmap is the public repo docs and the public
 * issues and milestones of those repos (ROLES-CHAT-8.a — no site URLs, and
 * `web-fetch` is never theirs). Private repos are refused. Deny lists still
 * win. ADMIN keeps the existing allowlist gate (GITHUB-6).
 *
 * Team (IDENTITY-10, #65): reads pass on an allowlisted repo (GITHUB-6) or a
 * confirmed-public one, like community; writes (reviews, comments) pass on
 * allowlisted repos only.
 */

import {
  checkGithubRepo,
  tryLoadAllowlist,
  type AllowlistConfig,
} from "../allowlist/index.ts";
import { createOctokit, splitOwnerRepo } from "../../plugins/github/api.ts";
import { ROLE_REFUSED_MESSAGE, resolveActingRole } from "./roles.ts";
import { allowlistFileRefusal, type RepoGateResult } from "./githubDeny.ts";

export type RepoVisibility = "public" | "private" | "unknown";

export type VisibilityLookup = (repo: string) => Promise<RepoVisibility>;

/** Octokit-backed visibility lookup (fails closed → unknown). */
export function createOctokitVisibilityLookup(
  env: NodeJS.ProcessEnv = process.env,
): VisibilityLookup {
  return async (repo: string) => {
    const parts = splitOwnerRepo(repo);
    if (!parts) return "unknown";
    const client = createOctokit(env);
    if (!("rest" in client)) return "unknown";
    try {
      const res = await client.rest.repos.get({
        owner: parts.owner,
        repo: parts.name,
      });
      return res.data.private ? "private" : "public";
    } catch {
      // 404 on private/missing looks the same — fail closed for community.
      return "unknown";
    }
  };
}

/**
 * Deny always wins. For community role sessions: allow only when the repo is
 * confirmed public (ROLES-CHAT-8). For team: GITHUB-6 allowlist, or (reads
 * only) a confirmed-public repo; `write` ⇒ allowlist only. Otherwise GITHUB-6
 * allowlist (owner / CLI).
 */
export async function checkRepoGateForActingRole(
  repo: string | undefined,
  opts: {
    env?: NodeJS.ProcessEnv;
    cfg?: AllowlistConfig;
    visibilityLookup?: VisibilityLookup;
    /** The command writes (review, comment, issue, PR): team needs the allowlist. */
    write?: boolean;
  } = {},
): Promise<RepoGateResult> {
  const env = opts.env ?? process.env;
  // ALLOW-4: allowlist file + env overlays (same loader as WATCH ingress).
  // A malformed / unreadable file refuses (fail closed), never env-only.
  let cfg = opts.cfg;
  if (!cfg) {
    const loaded = await tryLoadAllowlist({ env });
    if (!loaded.ok) return allowlistFileRefusal(repo, loaded.error);
    cfg = loaded.config;
  }

  if (!repo || !repo.includes("/")) {
    return {
      ok: false,
      repo: repo ?? "",
      error:
        "GITHUB-6: GitHub plugin requires explicit --repo OWNER/REPO so the deny/allow gate can run",
    };
  }

  // Deny lists always win (even for community public path).
  const normalized = repo.toLowerCase();
  const owner = normalized.split("/")[0] ?? "";
  for (const d of cfg.github.denyOrgs) {
    if (d.toLowerCase() === owner) {
      return {
        ok: false,
        repo,
        error: `GITHUB-6: not authorized: org "${owner}" is denied`,
      };
    }
  }
  for (const d of cfg.github.denyRepos) {
    const p = d.toLowerCase();
    const match =
      p.endsWith("/*")
        ? normalized.startsWith(p.slice(0, -2) + "/")
        : p === normalized;
    if (match) {
      return {
        ok: false,
        repo,
        error: `GITHUB-6: not authorized: repo "${repo}" is denied`,
      };
    }
  }

  const role = await resolveActingRole(env);
  if (role === "team") {
    // IDENTITY-10: reviews and comments on allowlisted repos only; reads
    // also reach confirmed-public repos (never less than community).
    const r = checkGithubRepo(repo, cfg);
    if (r.ok) return { ok: true, repo: r.repo! };
    if (opts.write) return { ok: false, repo, error: r.error };
    const lookup = opts.visibilityLookup ?? createOctokitVisibilityLookup(env);
    if ((await lookup(repo)) === "public") return { ok: true, repo };
    return { ok: false, repo, error: r.error };
  }
  const community = role === "community";
  if (community) {
    if (opts.write) {
      // runPlugin refuses community writes first; this keeps the gate closed
      // for any caller that reaches a write handler directly (ROLES-CHAT-3).
      return { ok: false, repo, error: `GITHUB-6: ${repo} — GitHub writes are ${ROLE_REFUSED_MESSAGE} (ROLES-CHAT-3)` };
    }
    const lookup = opts.visibilityLookup ?? createOctokitVisibilityLookup(env);
    const vis = await lookup(repo);
    if (vis === "public") {
      return { ok: true, repo };
    }
    if (vis === "private") {
      return {
        ok: false,
        repo,
        error:
          "ROLES-CHAT-8: private GitHub repos are not available in community chat — ask about public repos, the site, or the roadmap",
      };
    }
    return {
      ok: false,
      repo,
      error:
        "ROLES-CHAT-8: could not confirm the repo is public — community chat only uses public GitHub",
    };
  }

  // ADMIN / interactive CLI: existing allowlist gate.
  const r = checkGithubRepo(repo, cfg);
  if (!r.ok) {
    return { ok: false, repo: repo ?? "", error: r.error };
  }
  return { ok: true, repo: r.repo! };
}

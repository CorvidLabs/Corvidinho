/**
 * GitHub allowlist gates (ALLOW-1,2,5 + GITHUB-6).
 * Default-deny: empty allow orgs+repos ⇒ refuse targeted repo actions.
 * Deny always wins. Never Merlin empty → BASIC.
 */

import type { AllowlistConfig, GateResult, GithubAllowlists } from "./types.ts";

function matchesRepoPattern(pattern: string, repo: string): boolean {
  const p = pattern.toLowerCase();
  const r = repo.toLowerCase();
  if (p.endsWith("/*")) {
    const owner = p.slice(0, -2);
    return r.startsWith(owner + "/");
  }
  return p === r;
}

function ownerOf(repo: string): string {
  return repo.split("/")[0]?.toLowerCase() ?? "";
}

/** True if any allow org/repo entry exists (users alone do not unlock repo plugins). */
export function hasGithubRepoAllowEntries(g: GithubAllowlists): boolean {
  return g.orgs.length > 0 || g.repos.length > 0;
}

export function isRepoAllowed(repo: string, g: GithubAllowlists): GateResult {
  const normalized = repo.toLowerCase();
  if (!normalized.includes("/")) {
    return { ok: false, error: "not authorized: invalid repo (expected OWNER/REPO)" };
  }
  const owner = ownerOf(normalized);

  for (const d of g.denyOrgs) {
    if (d.toLowerCase() === owner) {
      return { ok: false, error: `not authorized: org "${owner}" is denied` };
    }
  }
  for (const d of g.denyRepos) {
    if (matchesRepoPattern(d, normalized)) {
      return { ok: false, error: `not authorized: repo "${repo}" is denied` };
    }
  }

  // Default-deny: empty allow ⇒ refuse (forbid Merlin empty→BASIC)
  if (!hasGithubRepoAllowEntries(g)) {
    return {
      ok: false,
      error:
        "not authorized: GitHub allowlist empty (default-deny; set CORVIDINHO_GITHUB_ALLOW_REPOS / ORGS or allowlist file)",
    };
  }

  const orgOk = g.orgs.some((o) => o.toLowerCase() === owner);
  const repoOk = g.repos.some((p) => matchesRepoPattern(p, normalized));
  if (!orgOk && !repoOk) {
    return {
      ok: false,
      error: `not authorized: repo "${repo}" is not on the GitHub allowlist`,
    };
  }
  return { ok: true };
}

export function isGithubUserAllowed(user: string, g: GithubAllowlists): GateResult {
  const u = user.trim().toLowerCase();
  if (!u) {
    return { ok: false, error: "not authorized: missing GitHub user" };
  }
  for (const d of g.denyUsers) {
    if (d.toLowerCase() === u) {
      return { ok: false, error: `not authorized: GitHub user "${user}" is denied` };
    }
  }
  if (g.users.length === 0) {
    return {
      ok: false,
      error:
        "not authorized: GitHub user allowlist empty (default-deny; set CORVIDINHO_GITHUB_ALLOW_USERS or allowlist file)",
    };
  }
  if (!g.users.some((x) => x.toLowerCase() === u)) {
    return { ok: false, error: `not authorized: GitHub user "${user}" is not allowlisted` };
  }
  return { ok: true };
}

export function checkGithubRepo(
  repo: string | undefined,
  cfg: AllowlistConfig,
): GateResult & { repo?: string } {
  if (!repo || !repo.includes("/")) {
    return {
      ok: false,
      error:
        "GITHUB-6: GitHub plugin requires explicit --repo OWNER/REPO so the deny/allow gate can run",
    };
  }
  const r = isRepoAllowed(repo, cfg.github);
  if (!r.ok) return { ok: false, error: r.error.includes("GITHUB-6") ? r.error : `GITHUB-6: ${r.error}`, repo };
  return { ok: true, repo };
}

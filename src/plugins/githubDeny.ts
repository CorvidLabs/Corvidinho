/**
 * GITHUB-6 — repo deny/allow gate for typed GitHub plugins.
 * Denylist always wins; optional allowlist (when non-empty) restricts to named repos.
 *
 * CORVIDINHO_GITHUB_DENY_REPOS — comma/space patterns: owner/repo or owner/*
 * CORVIDINHO_GITHUB_ALLOW_REPOS — if set/non-empty, only these patterns are allowed
 */

export type RepoGateResult =
  | { ok: true; repo: string }
  | { ok: false; repo: string; error: string };

function parseList(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function extractRepoFromArgs(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--repo" || a === "-R") {
      return args[i + 1];
    }
    if (a.startsWith("--repo=")) return a.slice("--repo=".length);
  }
  return undefined;
}

function matches(pattern: string, repo: string): boolean {
  const p = pattern.toLowerCase();
  const r = repo.toLowerCase();
  if (p.endsWith("/*")) {
    const owner = p.slice(0, -2);
    return r.startsWith(owner + "/");
  }
  return p === r;
}

/**
 * Enforce deny/allow. If repo is undefined, skip gate (gh uses cwd default);
 * callers that need a hard gate should resolve repo first.
 */
export function checkRepoGate(
  repo: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): RepoGateResult {
  if (!repo || !repo.includes("/")) {
    return {
      ok: false,
      repo: repo ?? "",
      error:
        "GITHUB-6: GitHub plugin requires explicit --repo OWNER/REPO so the deny/allow gate can run",
    };
  }
  const deny = parseList(env.CORVIDINHO_GITHUB_DENY_REPOS);
  const allow = parseList(env.CORVIDINHO_GITHUB_ALLOW_REPOS);
  const normalized = repo.toLowerCase();

  for (const d of deny) {
    if (matches(d, normalized)) {
      return {
        ok: false,
        repo,
        error: `GITHUB-6: repo "${repo}" is denied by CORVIDINHO_GITHUB_DENY_REPOS`,
      };
    }
  }
  if (allow.length > 0 && !allow.some((a) => matches(a, normalized))) {
    return {
      ok: false,
      repo,
      error: `GITHUB-6: repo "${repo}" is not in CORVIDINHO_GITHUB_ALLOW_REPOS`,
    };
  }
  return { ok: true, repo };
}

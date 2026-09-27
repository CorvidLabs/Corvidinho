/**
 * GITHUB-6 — repo deny/allow gate for typed GitHub plugins.
 * Default-deny (ALLOW-1,2,5): empty allowlist ⇒ refuse. Deny always wins.
 * Never Merlin empty-permissions → BASIC allow-by-default.
 *
 * Config: allowlist file + env overlays via src/allowlist (ALLOW-4).
 * CORVIDINHO_GITHUB_DENY_REPOS / ALLOW_REPOS / ALLOW_ORGS / …
 */

import {
  checkGithubRepo,
  configFromEnvOnly,
  tryLoadAllowlist,
  type AllowlistConfig,
} from "../allowlist/index.ts";

export type RepoGateResult =
  | { ok: true; repo: string }
  | { ok: false; repo: string; error: string };

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

/**
 * Enforce default-deny allowlist. Requires explicit --repo OWNER/REPO.
 * Pass a loaded `AllowlistConfig`; the env-only fallback skips the allowlist
 * file, so runtime callers use `checkRepoGateAsync` (file + env, ALLOW-4).
 */
export function checkRepoGate(
  repo: string | undefined,
  envOrCfg: NodeJS.ProcessEnv | AllowlistConfig = process.env,
): RepoGateResult {
  const cfg: AllowlistConfig =
    envOrCfg && typeof envOrCfg === "object" && "github" in envOrCfg && "discord" in envOrCfg
      ? (envOrCfg as AllowlistConfig)
      : configFromEnvOnly(envOrCfg as NodeJS.ProcessEnv);

  const r = checkGithubRepo(repo, cfg);
  if (!r.ok) {
    return { ok: false, repo: repo ?? "", error: r.error };
  }
  return { ok: true, repo: r.repo! };
}

/**
 * GITHUB-6 refusal for an allowlist file that exists but cannot be read or
 * parsed: its deny lists are unknown, so nothing is admitted (not even by an
 * env allow list). The loader's error names the path, line and key only.
 */
export function allowlistFileRefusal(repo: string | undefined, error: string): RepoGateResult {
  return { ok: false, repo: repo ?? "", error: `GITHUB-6: refused — ${error}` };
}

/**
 * GITHUB-6 gate over the full allowlist (file + env overlays, ALLOW-4) — the
 * same loader WATCH ingress uses, so file deny lists are never skipped. A
 * malformed or unreadable file refuses (never a throw, never env-only).
 */
export async function checkRepoGateAsync(
  repo: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Promise<RepoGateResult> {
  const loaded = await tryLoadAllowlist({ env });
  if (!loaded.ok) return allowlistFileRefusal(repo, loaded.error);
  return checkRepoGate(repo, loaded.config);
}

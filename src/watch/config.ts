/**
 * WATCH poll config: token + mention username + allowlisted repos.
 * Empty github orgs+repos → fail start (default-deny).
 */

import { resolve } from "node:path";
import {
  hasGithubRepoAllowEntries,
} from "../allowlist/github.ts";
import {
  loadAllowlist,
  type LoadOptions,
} from "../allowlist/load.ts";
import type { AllowlistConfig } from "../allowlist/types.ts";
import type { WatchConfig } from "./types.ts";

export type ConfigError = {
  ok: false;
  code: "missing_token" | "missing_username" | "empty_repos" | "allowlist";
  message: string;
};

export type ConfigOk = { ok: true; config: WatchConfig };
export type ConfigResult = ConfigOk | ConfigError;

const DEFAULT_INTERVAL_MS = 60_000;
const MIN_INTERVAL_MS = 30_000;
const DEFAULT_MAX_TRIGGERS = 5;

function resolveToken(env: NodeJS.ProcessEnv): string | null {
  const t = env.GITHUB_TOKEN?.trim() || env.GH_TOKEN?.trim() || "";
  return t.length > 0 ? t : null;
}

function resolveUsername(env: NodeJS.ProcessEnv): string | null {
  const u =
    env.CORVIDINHO_WATCH_USERNAME?.trim() ||
    env.GITHUB_WATCH_USERNAME?.trim() ||
    "";
  return u.length > 0 ? u : null;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw || !raw.trim()) return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Expand allowlist orgs+repos into concrete OWNER/REPO list for polling.
 * Patterns ending in /* are kept as org wildcards for the searcher.
 */
export function expandWatchRepos(allowlist: AllowlistConfig): string[] {
  const out = new Set<string>();
  for (const r of allowlist.github.repos) {
    const t = r.trim();
    if (t) out.add(t);
  }
  for (const o of allowlist.github.orgs) {
    const org = o.trim();
    if (org) out.add(`${org}/*`);
  }
  return [...out];
}

export function goLiveChecklist(): string {
  return `WATCH go-live checklist (poll-first for bot/VM):
  1. GITHUB_TOKEN or GH_TOKEN in VM env/secret store (never commit)
  2. CORVIDINHO_WATCH_USERNAME = GitHub login to listen for (e.g. corvid-agent)
  3. Non-empty GitHub allowlists: orgs and/or repos + users
     (~/.config/corvidinho/allowlist.toml or CORVIDINHO_GITHUB_ALLOW_*)
  4. Optional: CORVIDINHO_WATCH_INTERVAL_MS (default 60000, min 30000)
  5. Optional: CORVIDINHO_WATCH_DRY_RUN=1 for local dry-run
  See docs/WATCH.md — webhook path deferred until a public URL exists.`;
}

export type LoadWatchOptions = LoadOptions & {
  projectRoot?: string;
};

/**
 * Load WATCH poll config. Fails when token, username, or repo allowlist empty.
 */
export async function loadWatchConfig(
  opts: LoadWatchOptions = {},
): Promise<ConfigResult> {
  const env = opts.env ?? process.env;
  const projectRoot = opts.projectRoot ?? process.cwd();

  const token = resolveToken(env);
  if (!token) {
    return {
      ok: false,
      code: "missing_token",
      message:
        "missing GITHUB_TOKEN or GH_TOKEN (required for github watch; secrets stay out of the repo)",
    };
  }

  const mentionUsername = resolveUsername(env);
  if (!mentionUsername) {
    return {
      ok: false,
      code: "missing_username",
      message:
        "missing CORVIDINHO_WATCH_USERNAME (GitHub login to listen for @mentions / review requests)",
    };
  }

  let allowlist: AllowlistConfig;
  try {
    allowlist = await loadAllowlist({
      env,
      filePath: opts.filePath,
    });
  } catch (err) {
    return {
      ok: false,
      code: "allowlist",
      message: `allowlist load failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!hasGithubRepoAllowEntries(allowlist.github)) {
    return {
      ok: false,
      code: "empty_repos",
      message:
        "GitHub repo allowlist empty (default-deny; set CORVIDINHO_GITHUB_ALLOW_REPOS / ORGS or allowlist file before watch)",
    };
  }

  const repos = expandWatchRepos(allowlist);
  if (repos.length === 0) {
    return {
      ok: false,
      code: "empty_repos",
      message: "no watch repos resolved from GitHub allowlist",
    };
  }

  const intervalRaw = parsePositiveInt(
    env.CORVIDINHO_WATCH_INTERVAL_MS,
    DEFAULT_INTERVAL_MS,
  );
  const intervalMs = Math.max(intervalRaw, MIN_INTERVAL_MS);
  const maxTriggersPerCycle = parsePositiveInt(
    env.CORVIDINHO_WATCH_MAX_TRIGGERS,
    DEFAULT_MAX_TRIGGERS,
  );
  const dryRun =
    env.CORVIDINHO_WATCH_DRY_RUN === "1" ||
    env.CORVIDINHO_WATCH_DRY_RUN === "true";
  const corvidinhoBin = env.CORVIDINHO_BIN?.trim()
    ? env.CORVIDINHO_BIN.trim()
    : resolve(projectRoot, "src/cli.ts");

  return {
    ok: true,
    config: {
      token,
      mentionUsername,
      repos,
      allowlist,
      intervalMs,
      maxTriggersPerCycle,
      dryRun,
      projectRoot,
      corvidinhoBin,
    },
  };
}

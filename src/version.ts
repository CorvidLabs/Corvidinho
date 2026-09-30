/**
 * Shared package version for CLI `version` and Discord bridge `/status`.
 * Single source: package.json (no hardcoded bridge/cli constants).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultProviderLabel, NO_PROVIDER_NOTICE, providerNotice } from "./agent/providers.ts";

/** Read semver from a package.json path; returns "0.0.0" if missing/invalid. */
export function readPackageVersion(
  packageJsonPath = join(import.meta.dir, "..", "package.json"),
): string {
  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      version?: unknown;
    };
    if (typeof parsed.version === "string" && parsed.version.trim()) {
      return parsed.version.trim();
    }
  } catch {
    /* missing / unreadable */
  }
  return "0.0.0";
}

/** Package version at module load (matches package.json). */
export const VERSION = readPackageVersion();

/**
 * Best-effort short SHA of HEAD. Returns undefined when git is unavailable
 * or the cwd is not a repo — never throws for offline/dogfood status.
 */
export function tryGitTipShortSha(
  cwd: string = process.cwd(),
): string | undefined {
  try {
    const proc = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (proc.exitCode !== 0) return undefined;
    const sha = new TextDecoder().decode(proc.stdout).trim();
    return sha || undefined;
  } catch {
    return undefined;
  }
}

/** Hostname (or raw base URL) for status display — never includes secrets. */
export function llmBaseHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host || baseUrl;
  } catch {
    return baseUrl;
  }
}

/**
 * LLM line for `/status` (AGENT-10 / AGENT-13): the default tier's model
 * (`CORVIDINHO_LLM_TIER`, default tool) as "LLM: <model> @ <host>" (non-openai
 * kinds as `kind:model`), followed by the no-provider notice when any tier has
 * no usable provider; "LLM: none — <notice>" when the default tier has none.
 * The notice's details (which tier, the setting names to set) are for the
 * owner (`ownerView`, default true); anyone else sees only that no provider
 * is configured, like the owner-only spend line (SAFE-14.a).
 * NEVER includes an API key.
 */
export function formatLlmStatusLine(
  env: NodeJS.ProcessEnv = process.env,
  opts: { ownerView?: boolean } = {},
): string {
  const ownerView = opts.ownerView ?? true;
  const provider = defaultProviderLabel(env);
  const full = providerNotice(env);
  const notice =
    full === null
      ? null
      : ownerView
        ? full
        : provider
          ? `${NO_PROVIDER_NOTICE} for some runs.`
          : `${NO_PROVIDER_NOTICE}.`;
  if (!provider) return `LLM: none — ${notice}`;
  return notice ? `LLM: ${provider} — ${notice}` : `LLM: ${provider}`;
}

/**
 * Short Discord presence / custom-status string from package version
 * (DISCORD-12). Always `vX.Y.Z` shape; no extra chrome.
 */
export function formatPresenceVersionString(
  version: string = VERSION,
): string {
  const v = version.trim() || "0.0.0";
  return v.startsWith("v") ? v : `v${v}`;
}

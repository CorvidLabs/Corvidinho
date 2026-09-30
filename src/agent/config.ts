/**
 * Load prove-before-done settings from fledge.toml [corvidinho].
 * `max_retries` matches Merlin's field name. The gate itself has no switch
 * (AGENT-14, REQ-agent-003): a `verify_before_complete` key is ignored, and
 * doctor warns about it (REQ-cli-085).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentConfig } from "./types.ts";

const DEFAULTS: AgentConfig = {
  maxRetries: 3,
};

/** `[corvidinho]` keys that used to turn verification off; now ignored. */
export const REMOVED_VERIFY_KEYS = ["verify_before_complete"] as const;

/** `[corvidinho]` `key = value` pairs (minimal TOML scrape, no full TOML dep). */
function corvidinhoEntries(toml: string): [string, string][] {
  const out: [string, string][] = [];
  let inSection = false;
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const section = line.match(/^\[([^\]]+)\]$/);
    if (section) {
      inSection = section[1] === "corvidinho";
      continue;
    }
    if (!inSection) continue;
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (m) out.push([m[1]!, m[2]!.trim()]);
  }
  return out;
}

/** Minimal TOML scrape for [corvidinho] keys (no full TOML dep). */
export function parseCorvidinhoSection(toml: string): Partial<AgentConfig> {
  const out: Partial<AgentConfig> = {};
  for (const [key, val] of corvidinhoEntries(toml)) {
    if (key === "max_retries") {
      const n = Number.parseInt(val, 10);
      if (Number.isFinite(n) && n >= 0) out.maxRetries = n;
    }
  }
  return out;
}

/**
 * Removed verify switches still set in `[corvidinho]` (ignored; doctor
 * names them). Empty when none, or when fledge.toml cannot be read.
 */
export function removedVerifyKeys(cwd: string): string[] {
  try {
    const text = readFileSync(join(cwd, "fledge.toml"), "utf8");
    const set = new Set(corvidinhoEntries(text).map(([k]) => k));
    return REMOVED_VERIFY_KEYS.filter((k) => set.has(k));
  } catch {
    return [];
  }
}

export function loadAgentConfig(cwd: string): AgentConfig {
  const path = join(cwd, "fledge.toml");
  try {
    const text = readFileSync(path, "utf8");
    const partial = parseCorvidinhoSection(text);
    return {
      maxRetries: partial.maxRetries ?? DEFAULTS.maxRetries,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export { DEFAULTS as agentConfigDefaults };

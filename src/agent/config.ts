/**
 * Load prove-before-done settings from fledge.toml [corvidinho].
 * Field names match Merlin's verify_before_complete / max_retries.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentConfig } from "./types.ts";

const DEFAULTS: AgentConfig = {
  verifyBeforeComplete: true,
  maxRetries: 3,
};

/** Minimal TOML scrape for [corvidinho] bool/int keys (no full TOML dep). */
export function parseCorvidinhoSection(toml: string): Partial<AgentConfig> {
  const lines = toml.split(/\r?\n/);
  let inSection = false;
  const out: Partial<AgentConfig> = {};
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const section = line.match(/^\[([^\]]+)\]$/);
    if (section) {
      inSection = section[1] === "corvidinho";
      continue;
    }
    if (!inSection) continue;
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].trim();
    if (key === "verify_before_complete") {
      if (val === "true") out.verifyBeforeComplete = true;
      else if (val === "false") out.verifyBeforeComplete = false;
    } else if (key === "max_retries") {
      const n = Number.parseInt(val, 10);
      if (Number.isFinite(n) && n >= 0) out.maxRetries = n;
    }
  }
  return out;
}

export function loadAgentConfig(cwd: string): AgentConfig {
  const path = join(cwd, "fledge.toml");
  try {
    const text = readFileSync(path, "utf8");
    const partial = parseCorvidinhoSection(text);
    return {
      verifyBeforeComplete:
        partial.verifyBeforeComplete ?? DEFAULTS.verifyBeforeComplete,
      maxRetries: partial.maxRetries ?? DEFAULTS.maxRetries,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export { DEFAULTS as agentConfigDefaults };

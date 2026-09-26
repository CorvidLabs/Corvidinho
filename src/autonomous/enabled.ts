/**
 * AUTONOMOUS-1 gate: autonomous mode is off until the project enables it in
 * project config — the project's `fledge.toml`, the same file whose
 * `[corvidinho]` section `loadAgentConfig` already reads:
 *
 *   [corvidinho.autonomous]
 *   enabled = true
 *
 * (`autonomous.enabled = true` under `[corvidinho]` is the same TOML key.)
 * Only the literal `true` turns it on; a missing file, section or key, any
 * other value, or an inline table is off. `fledge.toml` is SAFE-2 protected
 * infra, so the agent's file tools cannot flip the switch on themselves.
 *
 * SAFE-9: autonomous (cross-agent) tools such as `delegate` are offered to a
 * session only when this gate is on and the delegation depth cap is not
 * reached; their code-tier minTier keeps them from small models.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canDelegateAtDepth, delegateDepthFromEnv } from "./delegate.ts";

export type AutonomousConfig = {
  enabled: boolean;
};

const OFF: AutonomousConfig = { enabled: false };

/** Minimal TOML scrape (no TOML dep), matching `parseCorvidinhoSection`. */
export function parseAutonomousConfig(toml: string): AutonomousConfig {
  let section = "";
  let enabled = false;
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    // `[table]` and `[[array-of-tables]]` both start a new key scope.
    const header = line.match(/^\[\[?\s*([^\]]+?)\s*\]\]?$/);
    if (header) {
      section = header[1]!.replace(/\s+/g, "");
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_.\s]+?)\s*=\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1]!.replace(/\s+/g, "");
    const full = section ? `${section}.${key}` : key;
    if (full === "corvidinho.autonomous.enabled") {
      enabled = kv[2]!.trim() === "true";
    }
  }
  return { enabled };
}

/** Read `<cwd>/fledge.toml`; unreadable or absent ⇒ off. */
export function loadAutonomousConfig(cwd: string): AutonomousConfig {
  try {
    return parseAutonomousConfig(readFileSync(join(cwd, "fledge.toml"), "utf8"));
  } catch {
    return { ...OFF };
  }
}

export function isAutonomousEnabled(cwd: string): boolean {
  return loadAutonomousConfig(cwd).enabled;
}

/**
 * SAFE-9 session gate: may this run be offered autonomous tools? Requires
 * the project switch (AUTONOMOUS-1) and a delegation depth below the cap.
 * Tier is filtered separately by the plugin's minTier in the tool catalog.
 */
export function autonomousSessionAllowed(opts: {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}): boolean {
  if (!isAutonomousEnabled(opts.cwd)) return false;
  return canDelegateAtDepth(delegateDepthFromEnv(opts.env ?? process.env));
}

/**
 * Typed plugin command surface (PLUGIN-1/2/6).
 * Danger and minTier are declared on every command; runtime enforces them (SAFE-1).
 */

import type { CapabilityTier } from "../agent/tier.ts";

export type PluginHandlerArgs = {
  /** Args after the command name (and after `--` when invoked via CLI). */
  args: string[];
  cwd: string;
  json: boolean;
  nonInteractive: boolean;
  allowlist: ReadonlySet<string>;
  /** Capability tier of the calling run, when known (tool loop). */
  tier?: CapabilityTier;
  /** Aborts with the calling run (AGENT-3), when the caller has one. */
  signal?: AbortSignal;
};

export type PluginHandlerResult = {
  ok: boolean;
  /** Structured payload for --json or further tooling. */
  data?: unknown;
  /** Human-readable summary when not using --json. */
  message?: string;
  error?: string;
  exitCode?: number;
};

export type PluginCommand = {
  name: string;
  description: string;
  /** When true, blocked in non-interactive unless allowlisted (SAFE-1 / CLI-3). */
  dangerous?: boolean;
  /**
   * When true, treated as mutating even if `dangerous` is false (ROLES-CHAT-5).
   * Non-ADMIN acting sessions never see or run mutating tools.
   */
  mutating?: boolean;
  /** Minimum autonomy/trust tier required (PLUGIN-2). Default 0. */
  minTier?: number;
  /**
   * Autonomous extra (PLUGIN-5): left out of the agent tool catalog unless
   * the session is allowed autonomous tools (AUTONOMOUS-1 / SAFE-9).
   */
  autonomous?: boolean;
  /** Where the command comes from (PLUGIN-6): "builtin" (default) or "fledge:<plugin>@<version>". */
  origin?: string;
  handler: (ctx: PluginHandlerArgs) => Promise<PluginHandlerResult>;
};

/** Public list row — enough schema to understand cost/risk (PLUGIN-6). */
export type PluginListEntry = {
  name: string;
  description: string;
  dangerous: boolean;
  /** Effective mutating (dangerous OR explicit mutating flag). */
  mutating: boolean;
  minTier: number;
};

/**
 * Typed plugin command surface (PLUGIN-1/2/6).
 * Danger and minTier are declared on every command; runtime enforces them (SAFE-1).
 */

export type PluginHandlerArgs = {
  /** Args after the command name (and after `--` when invoked via CLI). */
  args: string[];
  cwd: string;
  json: boolean;
  nonInteractive: boolean;
  allowlist: ReadonlySet<string>;
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
  /** Minimum autonomy/trust tier required (PLUGIN-2). Default 0. */
  minTier?: number;
  /** Where the command comes from (PLUGIN-6): "builtin" (default) or "fledge:<plugin>@<version>". */
  origin?: string;
  handler: (ctx: PluginHandlerArgs) => Promise<PluginHandlerResult>;
};

/** Public list row — enough schema to understand cost/risk (PLUGIN-6). */
export type PluginListEntry = {
  name: string;
  description: string;
  dangerous: boolean;
  minTier: number;
};

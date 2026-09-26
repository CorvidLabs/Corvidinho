import { get } from "./registry.ts";
import type { PluginHandlerResult } from "./types.ts";

export type RunOptions = {
  name: string;
  args?: string[];
  cwd?: string;
  json?: boolean;
  nonInteractive?: boolean;
  allowlist?: ReadonlySet<string> | string[];
};

export class PluginDeniedError extends Error {
  readonly exitCode = 2;
  constructor(commandName: string) {
    super(
      `Denied: plugin "${commandName}" is marked dangerous and non-interactive mode is on (SAFE-1). Allowlist it (CORVIDINHO_ALLOWLIST) or run interactively.`,
    );
    this.name = "PluginDeniedError";
  }
}

export class PluginNotFoundError extends Error {
  readonly exitCode = 1;
  constructor(commandName: string) {
    super(`Unknown plugin command: ${commandName}`);
    this.name = "PluginNotFoundError";
  }
}

function toAllowSet(allowlist?: ReadonlySet<string> | string[]): Set<string> {
  if (!allowlist) return new Set();
  if (allowlist instanceof Set) return new Set(allowlist);
  return new Set(allowlist);
}

/**
 * Run a registered plugin by name.
 * Enforces dangerous + nonInteractive deny unless allowlisted (SAFE-1 / PLUGIN-2).
 */
export async function runPlugin(opts: RunOptions): Promise<PluginHandlerResult> {
  const cmd = get(opts.name);
  if (!cmd) {
    throw new PluginNotFoundError(opts.name);
  }

  const allow = toAllowSet(opts.allowlist);
  const nonInteractive = Boolean(opts.nonInteractive);
  const dangerous = Boolean(cmd.dangerous);

  if (dangerous && nonInteractive && !allow.has(cmd.name)) {
    const err = new PluginDeniedError(cmd.name);
    return {
      ok: false,
      error: err.message,
      exitCode: err.exitCode,
    };
  }

  return cmd.handler({
    args: opts.args ?? [],
    cwd: opts.cwd ?? process.cwd(),
    json: Boolean(opts.json),
    nonInteractive,
    allowlist: allow,
  });
}

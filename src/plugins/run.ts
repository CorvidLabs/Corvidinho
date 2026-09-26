import {
  appendAudit,
  argsDigest,
  auditContextFromEnv,
  auditKeyFromEnv,
  type AuditOutcome,
} from "../audit/log.ts";
import { openCorvidinhoDb } from "../store/db.ts";
import { get } from "./registry.ts";
import type { PluginHandlerArgs, PluginHandlerResult } from "./types.ts";

export type RunOptions = {
  name: string;
  args?: string[];
  cwd?: string;
  json?: boolean;
  nonInteractive?: boolean;
  allowlist?: ReadonlySet<string> | string[];
  /** Passed to the handler: calling run's tier and abort signal. */
  tier?: PluginHandlerArgs["tier"];
  signal?: AbortSignal;
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

  const args = opts.args ?? [];

  if (dangerous && nonInteractive && !allow.has(cmd.name)) {
    const err = new PluginDeniedError(cmd.name);
    // SAFE intent: log the close call (best-effort for denials).
    try {
      recordAudit(cmd.name, args, "denied", err.exitCode);
    } catch {
      /* denial already refuses; audit failure must not flip it */
    }
    return {
      ok: false,
      error: err.message,
      exitCode: err.exitCode,
    };
  }

  if (dangerous) {
    // SAFE-5: a dangerous action does not run unless its intent is on the
    // tamper-evident trail first (fail closed).
    try {
      recordAudit(cmd.name, args, "started");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        error: `refused: audit log unavailable for dangerous plugin "${cmd.name}" (SAFE-5): ${msg}`,
        exitCode: 2,
      };
    }
  }

  let result: PluginHandlerResult;
  try {
    result = await cmd.handler({
      args,
      cwd: opts.cwd ?? process.cwd(),
      json: Boolean(opts.json),
      nonInteractive,
      allowlist: allow,
      ...(opts.tier ? { tier: opts.tier } : {}),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
  } catch (e) {
    if (dangerous) safeRecord(cmd.name, args, "error", 1);
    throw e;
  }
  if (dangerous) {
    safeRecord(cmd.name, args, result.ok ? "ok" : "error", result.exitCode);
  }
  return result;
}

/** Append one audit row for a plugin run to the shared DB (SAFE-5). */
function recordAudit(
  name: string,
  args: readonly string[],
  outcome: AuditOutcome,
  exitCode?: number,
): void {
  const env = process.env;
  const db = openCorvidinhoDb({ env });
  try {
    appendAudit(
      db,
      {
        action: name,
        ...auditContextFromEnv(env),
        argsDigest: argsDigest(args),
        outcome,
        exitCode,
      },
      { key: auditKeyFromEnv(env) },
    );
  } finally {
    db.close();
  }
}

function safeRecord(
  name: string,
  args: readonly string[],
  outcome: AuditOutcome,
  exitCode?: number,
): void {
  try {
    recordAudit(name, args, outcome, exitCode);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[audit] could not record ${outcome} for ${name}: ${msg}`);
  }
}

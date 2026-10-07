import {
  appendAudit,
  argsDigest,
  auditContextFromEnv,
  auditKeyFromEnv,
  type AuditOutcome,
} from "../audit/log.ts";
import { openCorvidinhoDb } from "../store/db.ts";
import { mustAskGate } from "./must-ask.ts";
import { isMutatingPlugin } from "./mutating.ts";
import { get } from "./registry.ts";
import {
  ROLE_REFUSED_MESSAGE,
  actingWorkTask,
  resolveActingRole,
  roleAllowsPlugin,
  roleSessionActive,
  watchCheckoutWriteRefusal,
  watchCheckoutWriteRefused,
} from "./roles.ts";
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
  /** Passed to the handler: the calling agent run's review context (GITHUB-9). */
  review?: PluginHandlerArgs["review"];
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
 * Refuses a WATCH run's checkout writes (REQ-plugins-1202), then enforces
 * ROLES-CHAT role gate, then dangerous + nonInteractive deny unless
 * allowlisted (SAFE-1 / PLUGIN-2), then the must-ask gate: a call its
 * command classes as prod or a channel post waits for the owner's Approve
 * card, and a deny or no answer runs nothing (AUTONOMY-9/10, SAFE-20;
 * src/plugins/must-ask.ts). Every caller goes through it.
 */
export async function runPlugin(opts: RunOptions): Promise<PluginHandlerResult> {
  const cmd = get(opts.name);
  if (!cmd) {
    throw new PluginNotFoundError(opts.name);
  }

  const allow = toAllowSet(opts.allowlist);
  const nonInteractive = Boolean(opts.nonInteractive);
  const dangerous = Boolean(cmd.dangerous);
  const mutating = isMutatingPlugin(cmd);

  const args = opts.args ?? [];

  // REQ-plugins-1202 (SESSION-WORKTREE-1 on GitHub): a WATCH run works in
  // the watcher's own checkout, with no worktree of its own, so tools that
  // write it are refused for every role, the owner's included.
  if (watchCheckoutWriteRefused(process.env, cmd.name)) {
    return { ok: false, error: watchCheckoutWriteRefusal(cmd.name), exitCode: 2 };
  }

  // ROLES-CHAT-3/5/6 + IDENTITY-9..12: the acting role, re-resolved at this
  // call from the owner config and the people list, gates mutating tools
  // (including files-write/edit marked mutating but not dangerous): the owner
  // runs them all, team only its review tools (and work tools in a /work
  // run), community none.
  // AGENT-1.a: team work tools need a /work run in a git work tree; in a
  // non-git project folder other people's runs only read.
  if (
    mutating &&
    roleSessionActive() &&
    !roleAllowsPlugin(
      await resolveActingRole(),
      cmd,
      actingWorkTask(process.env, opts.cwd ?? process.cwd()),
    )
  ) {
    return {
      ok: false,
      error: `Denied: plugin "${cmd.name}" is ${ROLE_REFUSED_MESSAGE} (ROLES-CHAT-3).`,
      exitCode: 2,
    };
  }

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

  // AUTONOMY-9/10 (+ .a): prod and deploy contact and channel posts wait for
  // the owner's Approve card; the class comes from the command's own
  // classifier, never from model text. Anything else runs with no ask
  // (AUTONOMY-11).
  const held = await mustAskGate({
    cmd,
    args,
    cwd: opts.cwd ?? process.cwd(),
    env: process.env,
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  if (held) {
    try {
      recordAudit(cmd.name, args, "denied", held.exitCode ?? 2);
    } catch {
      /* the refusal stands; audit failure must not flip it */
    }
    return held;
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
      ...(opts.review ? { review: opts.review } : {}),
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

/**
 * Fledge plugin commands as Corvidinho plugins (FLEDGE-4 / PLUGIN-2/3).
 *
 * Every Fledge command becomes `fledge-<command>` and runs as
 * `fledge --non-interactive plugins run <command> -- <argv...>` in the project
 * root — an argv array, never a shell string. The `--` keeps model-supplied
 * argv such as `--help`, `--json` or `--ni` from being read as fledge's own
 * options (fledge passes everything after it to the plugin verbatim).
 *
 * Scope: a command is bound to the project root it was discovered for and
 * refuses to run anywhere else, so a long-running process never runs one
 * project's plugin under another project's registration (see index.ts).
 *
 * Danger (SAFE-1 / PLUGIN-2): fledge's plugin manifest has no danger or tier
 * field, and a native plugin is an unsandboxed binary running with the
 * operator's privileges (manifest capabilities only gate fledge-v1 host
 * requests). Corvidinho cannot tell a read-only command from a destructive
 * one, so every Fledge command is `dangerous: true`: non-interactive runs are
 * denied unless the operator allowlists `fledge-<command>`.
 *
 * Tier: native plugins are arbitrary code → minTier 2 (code, like
 * `shell-exec`). A wasm-sandboxed plugin without the `exec` capability →
 * minTier 1 (tool). Unknown capabilities are treated as native.
 */

import { resolve } from "node:path";
import { scrubSecrets } from "../../src/store/scrub.ts";
import type { PluginCommand, PluginHandlerResult } from "../../src/plugins/types.ts";
import type { FledgePluginInfo } from "./discover.ts";
import { fledgePluginMustAsk } from "./must-ask.ts";
import { fledgeChildEnv, spawnCapped } from "./spawn.ts";

export const FLEDGE_COMMAND_PREFIX = "fledge-";
export const RUN_TIMEOUT_MS = 120_000;
export const RUN_MAX_OUTPUT_BYTES = 64 * 1024;

export function fledgeCommandName(command: string): string {
  return `${FLEDGE_COMMAND_PREFIX}${command}`;
}

export function fledgeOrigin(info: Pick<FledgePluginInfo, "name" | "version">): string {
  return `fledge:${info.name}@${info.version}`;
}

/** minTier for a Fledge plugin's commands (see module doc). */
export function fledgeMinTier(info: FledgePluginInfo): number {
  const caps = info.capabilities;
  if (info.runtime === "wasm" && caps != null && !caps.exec) return 1;
  return 2;
}

/** Small description on purpose: it is paid for in every tool catalog (FLEDGE-5). */
export function fledgeDescription(info: FledgePluginInfo, command: string): string {
  const sandbox = info.runtime === "wasm" ? "wasm sandbox" : "native, unsandboxed";
  const c = info.capabilities;
  const caps: string[] = c
    ? (["exec", "store", "metadata", "network"] as const).filter((k) => c[k])
    : [];
  if (c && c.filesystem !== "none") caps.push(`fs:${c.filesystem}`);
  const capText = caps.length ? `; caps ${caps.join(",")}` : "";
  return `Fledge plugin ${info.name} v${info.version} (${info.trustTier}, ${sandbox}${capText}): runs \`fledge plugins run ${command}\` with argv in the project root.`;
}

export type RunFledgeOptions = {
  fledgeBin: string;
  plugin: string;
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxOutputBytes?: number;
  /** Calling run's abort signal (AGENT-3): stops the plugin's process tree. */
  signal?: AbortSignal;
};

/** argv for one Fledge plugin command; `--` ends fledge's own options. */
export function fledgeRunArgv(fledgeBin: string, command: string, args: readonly string[]): string[] {
  return [
    fledgeBin,
    "--non-interactive",
    "plugins",
    "run",
    command,
    "--",
    ...args.map((a) => String(a)),
  ];
}

export async function runFledgeCommand(opts: RunFledgeOptions): Promise<PluginHandlerResult> {
  const root = resolve(opts.cwd);
  const timeoutMs = opts.timeoutMs ?? RUN_TIMEOUT_MS;
  const maxBytes = opts.maxOutputBytes ?? RUN_MAX_OUTPUT_BYTES;
  const argv = fledgeRunArgv(opts.fledgeBin, opts.command, opts.args);
  const res = await spawnCapped(argv, {
    cwd: root,
    env: fledgeChildEnv(opts.env ?? process.env, root),
    timeoutMs,
    maxBytes,
    signal: opts.signal,
  });
  const label = `fledge plugin command "${opts.command}"`;
  if (res.spawnError) {
    return {
      ok: false,
      error: `${label} could not start: ${res.spawnError}`,
      exitCode: 127,
    };
  }

  // Plugin output is untrusted data headed for chat/logs: scrub secrets (SAFE-6).
  let output = scrubSecrets(`${res.stdout}${res.stderr}`);
  if (res.truncated) output += `\n[output truncated at ${maxBytes} bytes per stream]\n`;
  const data = {
    plugin: opts.plugin,
    command: opts.command,
    cwd: root,
    exitCode: res.timedOut ? 124 : res.aborted ? 130 : res.code,
    timedOut: res.timedOut,
    aborted: res.aborted,
    truncated: res.truncated,
    output,
  };

  if (res.timedOut) {
    return {
      ok: false,
      data,
      error: `${label} timed out after ${timeoutMs}ms and was killed`,
      exitCode: 124,
    };
  }
  if (res.aborted) {
    return {
      ok: false,
      data,
      error: `${label} stopped: the calling run was interrupted`,
      exitCode: 130,
    };
  }
  if (res.code !== 0) {
    const shown = output.length > 2000 ? `…${output.slice(output.length - 2000)}` : output;
    return {
      ok: false,
      data,
      message: output,
      error: `${label} exited ${res.code}${shown.trim() ? `:\n${shown}` : ""}`,
      exitCode: res.code || 1,
    };
  }
  return { ok: true, data, message: output || "(no output)\n", exitCode: 0 };
}

/**
 * Build the typed Corvidinho command for one Fledge plugin command, bound to
 * the project root it was discovered for: a call from any other cwd is
 * refused (exit 2) without starting fledge.
 */
export function fledgePluginCommand(
  info: FledgePluginInfo,
  command: string,
  fledgeBin: string,
  env: NodeJS.ProcessEnv | undefined,
  projectRoot: string,
): PluginCommand {
  const name = fledgeCommandName(command);
  const root = resolve(projectRoot);
  return {
    name,
    description: fledgeDescription(info, command),
    dangerous: true,
    minTier: fledgeMinTier(info),
    origin: fledgeOrigin(info),
    // AUTONOMY-9/9.a: a command whose name or argv names a prod or deploy tool asks first.
    mustAsk: fledgePluginMustAsk(command),
    handler: async (ctx) => {
      if (resolve(ctx.cwd) !== root) {
        return {
          ok: false,
          error: `refused: ${name} was discovered for another project root; load Fledge plugins for this directory first`,
          exitCode: 2,
        };
      }
      return runFledgeCommand({
        fledgeBin,
        plugin: info.name,
        command,
        args: ctx.args,
        cwd: root,
        env,
        signal: ctx.signal,
      });
    },
  };
}

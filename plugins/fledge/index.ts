/**
 * Register the project's Fledge plugins as Corvidinho plugin commands
 * (FLEDGE-4 / PLUGIN-3): no Corvidinho release needed for a new Fledge plugin.
 *
 * Async and lazy — only `plugins list`, `plugins run fledge-*` and the tool
 * loop (when dangerous tools are offered) pay for the fledge subprocess.
 * Discovery failures never break builtins; the report says why.
 *
 * Project scope: the registry holds one command per name, so Fledge commands
 * are bound to the project root (resolved cwd) they were discovered for.
 * Loading another root rebinds same-named commands to that root and removes
 * the ones it does not have; a bound command refuses a call from any other
 * cwd. A long-running process therefore never offers or runs one project's
 * plugin, tier or danger marking under another project's name.
 */

import { resolve } from "node:path";
import type { PluginCommand } from "../../src/plugins/types.ts";
import { get, register, unregister } from "../../src/plugins/registry.ts";
import {
  discoverFledgePlugins,
  type DiscoverOptions,
  type FledgeDiscovery,
} from "./discover.ts";
import { fledgeCommandName, fledgeOrigin, fledgePluginCommand } from "./commands.ts";

export type FledgeLoadReport = FledgeDiscovery & {
  /** Corvidinho command names now backed by Fledge. */
  registered: string[];
  skipped: { name: string; reason: string }[];
};

const cache = new Map<string, FledgeLoadReport>();

/** Fledge commands currently in the registry, by name, with their project root. */
const bound = new Map<string, { root: string; command: PluginCommand }>();

/** Test seam: forget earlier discovery results and their registrations. */
export function resetFledgeDiscovery(): void {
  cache.clear();
  for (const [name, b] of bound) unregister(name, b.command);
  bound.clear();
}

/** Project root each registered Fledge command is bound to (status / tests). */
export function fledgeBindings(): { name: string; root: string }[] {
  return [...bound].map(([name, b]) => ({ name, root: b.root }));
}

/** A cached report still describes the registry for `root`. */
function isCurrent(root: string, report: FledgeLoadReport): boolean {
  for (const b of bound.values()) if (b.root !== root) return false;
  return report.registered.every((n) => {
    const b = bound.get(n);
    return b !== undefined && get(n) === b.command;
  });
}

export async function loadFledgePlugins(
  opts: DiscoverOptions & { force?: boolean } = {},
): Promise<FledgeLoadReport> {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const cached = cache.get(cwd);
  if (cached && !opts.force && isCurrent(cwd, cached)) {
    return cached;
  }

  let discovery: FledgeDiscovery;
  try {
    discovery = await discoverFledgePlugins({ ...opts, cwd });
  } catch (e) {
    discovery = {
      ok: false,
      fledgeBin: null,
      plugins: [],
      warnings: [],
      error: `fledge discovery failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // From here on no await: the registry is rebound for `cwd` in one step.
  const previous = new Map(bound);
  const registered: string[] = [];
  const skipped: { name: string; reason: string }[] = [];
  if (discovery.ok && discovery.fledgeBin) {
    for (const info of discovery.plugins) {
      const origin = fledgeOrigin(info);
      for (const command of info.commands) {
        const name = fledgeCommandName(command);
        const existing = get(name);
        const prev = previous.get(name);
        const ours = prev !== undefined && existing === prev.command;
        if (existing && (!ours || registered.includes(name))) {
          // A builtin, another plugin, or an earlier command of this load.
          skipped.push({
            name,
            reason: `name already registered by ${existing.origin ?? "builtin"}`,
          });
          continue;
        }
        if (ours && prev.root === cwd && existing?.origin === origin) {
          registered.push(name);
          continue;
        }
        // Bound to another project root, or a different plugin/version now.
        if (ours) unregister(name, prev.command);
        const cmd = fledgePluginCommand(info, command, discovery.fledgeBin, opts.env, cwd);
        register(cmd);
        bound.set(name, { root: cwd, command: cmd });
        registered.push(name);
      }
    }
  }
  // Commands left from another root (or no longer offered here) leave the
  // registry, so this root's catalog never lists them.
  for (const [name, prev] of previous) {
    if (registered.includes(name)) continue;
    unregister(name, prev.command);
    bound.delete(name);
  }

  const report: FledgeLoadReport = { ...discovery, registered, skipped };
  cache.set(cwd, report);
  return report;
}

/** One human line for `plugins list` (PLUGIN-6). */
export function fledgeStatusLines(report: FledgeLoadReport): string[] {
  if (!report.ok) {
    return [`Fledge plugins: none loaded (${report.error ?? "unavailable"})`];
  }
  const lines = [
    `Fledge plugins: ${report.plugins.length} plugin(s), ${report.registered.length} command(s) registered (dangerous; allowlist fledge-<command> for non-interactive runs)`,
  ];
  for (const s of report.skipped) lines.push(`  skipped ${s.name}: ${s.reason}`);
  for (const w of report.warnings) lines.push(`  warning: ${w}`);
  return lines;
}

export { discoverFledgePlugins } from "./discover.ts";
export type { FledgeDiscovery, FledgePluginInfo } from "./discover.ts";
export {
  fledgeCommandName,
  fledgeMinTier,
  runFledgeCommand,
} from "./commands.ts";

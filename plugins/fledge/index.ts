/**
 * Register the project's Fledge plugins as Corvidinho plugin commands
 * (FLEDGE-4 / PLUGIN-3): no Corvidinho release needed for a new Fledge plugin.
 *
 * Async and lazy — only `plugins list`, `plugins run fledge-*` and the tool
 * loop (when dangerous tools are offered) pay for the fledge subprocess.
 * Discovery failures never break builtins; the report says why.
 */

import { resolve } from "node:path";
import { get, register } from "../../src/plugins/registry.ts";
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

/** Test seam: forget earlier discovery results. */
export function resetFledgeDiscovery(): void {
  cache.clear();
}

export async function loadFledgePlugins(
  opts: DiscoverOptions & { force?: boolean } = {},
): Promise<FledgeLoadReport> {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const cached = cache.get(cwd);
  if (cached && !opts.force && cached.registered.every((n) => get(n))) {
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

  const registered: string[] = [];
  const skipped: { name: string; reason: string }[] = [];
  if (discovery.ok && discovery.fledgeBin) {
    for (const info of discovery.plugins) {
      const origin = fledgeOrigin(info);
      for (const command of info.commands) {
        const name = fledgeCommandName(command);
        const existing = get(name);
        if (existing) {
          if (existing.origin === origin) {
            registered.push(name);
          } else {
            skipped.push({
              name,
              reason: `name already registered by ${existing.origin ?? "builtin"}`,
            });
          }
          continue;
        }
        register(fledgePluginCommand(info, command, discovery.fledgeBin, opts.env));
        registered.push(name);
      }
    }
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

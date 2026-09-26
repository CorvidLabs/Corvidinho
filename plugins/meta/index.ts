import { get, list, register } from "../../src/plugins/registry.ts";
import type { PluginCommand } from "../../src/plugins/types.ts";

const pluginsList: PluginCommand = {
  name: "plugins-list",
  description: "List loaded plugin commands with danger/tier markings (PLUGIN-6)",
  dangerous: false,
  minTier: 0,
  async handler(ctx) {
    const entries = list();
    return {
      ok: true,
      data: entries,
      message: ctx.json
        ? undefined
        : entries
            .map(
              (e) =>
                `${e.name}\tdangerous=${e.dangerous}\tminTier=${e.minTier}\t${e.description}`,
            )
            .join("\n"),
      exitCode: 0,
    };
  },
};

/**
 * Intentionally dangerous no-op for SAFE-1 / CLI-3 deny-path demos and tests.
 * Does nothing harmful; only used to exercise allowlist gating.
 */
const dangerPing: PluginCommand = {
  name: "danger-ping",
  description: "Dangerous no-op (SAFE-1 deny demo); returns pong when allowed",
  dangerous: true,
  minTier: 1,
  async handler() {
    return { ok: true, data: { pong: true }, message: "pong", exitCode: 0 };
  },
};

export function loadMetaPlugins(): void {
  if (get("plugins-list")) return;
  register(pluginsList);
  register(dangerPing);
}

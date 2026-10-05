import { get, register } from "../../src/plugins/registry.ts";
import { createGifCommands, gifCommands } from "./commands.ts";

/** Register `gif-search` (PLUGIN-8 / PLUGIN-9 / REQ-plugins-3182). */
export function loadGifPlugins(): void {
  const first = gifCommands[0]?.name;
  if (first && get(first)) return;
  for (const cmd of gifCommands) {
    register(cmd);
  }
}

export { createGifCommands, gifCommands };

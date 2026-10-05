import { get, register } from "../../src/plugins/registry.ts";
import { createWebCommands, webCommands } from "./commands.ts";

/** Register `web-fetch` (PLUGIN-1 / SAFE-7 / REQ-plugins-111) and `web-search` (PLUGIN-7 / REQ-plugins-318). */
export function loadWebPlugins(): void {
  const first = webCommands[0]?.name;
  if (first && get(first)) return;
  for (const cmd of webCommands) {
    register(cmd);
  }
}

export { createWebCommands, webCommands };

import { get, register } from "../../src/plugins/registry.ts";
import { gitCommands } from "./commands.ts";

/** Register git plugins (PLUGIN-1 / REQ-plugins-182); idempotent per registry. */
export function loadGitPlugins(): void {
  const first = gitCommands[0]?.name;
  if (first && get(first)) return;
  for (const cmd of gitCommands) {
    register(cmd);
  }
}

export { gitCommands };

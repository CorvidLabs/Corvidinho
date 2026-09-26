import { get, register } from "../../src/plugins/registry.ts";
import { searchCommands } from "./commands.ts";

export function loadSearchPlugins(): void {
  const first = searchCommands[0]?.name;
  if (first && get(first)) return;
  for (const cmd of searchCommands) {
    register(cmd);
  }
}

export { searchCommands };

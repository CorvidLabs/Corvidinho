import { get, register } from "../../src/plugins/registry.ts";
import { memoryCommands } from "./commands.ts";

export function loadMemoryPlugins(): void {
  const first = memoryCommands[0]?.name;
  if (first && get(first)) return;
  for (const cmd of memoryCommands) {
    register(cmd);
  }
}

export { memoryCommands };

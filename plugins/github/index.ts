import { get, register } from "../../src/plugins/registry.ts";
import { githubCommands } from "./commands.ts";

export function loadGithubPlugins(): void {
  const first = githubCommands[0]?.name;
  if (first && get(first)) return;
  for (const cmd of githubCommands) {
    register(cmd);
  }
}

export { githubCommands };

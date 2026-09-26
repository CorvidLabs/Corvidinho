import { register } from "../../src/plugins/registry.ts";
import { githubCommands } from "./commands.ts";

let loaded = false;

export function loadGithubPlugins(): void {
  if (loaded) return;
  for (const cmd of githubCommands) {
    register(cmd);
  }
  loaded = true;
}

export { githubCommands };

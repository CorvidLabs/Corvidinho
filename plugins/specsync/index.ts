import { register } from "../../src/plugins/registry.ts";
import { specsyncCommands } from "./commands.ts";

let loaded = false;

export function loadSpecsyncPlugins(): void {
  if (loaded) return;
  for (const cmd of specsyncCommands) {
    register(cmd);
  }
  loaded = true;
}

export { specsyncCommands };
export {
  listRegisteredModules,
  readCompanions,
  readModuleSpec,
  runSpecCheck,
  spawnSpecsync,
} from "./api.ts";

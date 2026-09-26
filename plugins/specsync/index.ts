import { get, register } from "../../src/plugins/registry.ts";
import { specsyncCommands } from "./commands.ts";

export function loadSpecsyncPlugins(): void {
  const first = specsyncCommands[0]?.name;
  if (first && get(first)) return;
  for (const cmd of specsyncCommands) {
    register(cmd);
  }
}

export { specsyncCommands };
export {
  listRegisteredModules,
  readCompanions,
  readModuleSpec,
  runSpecCheck,
  spawnSpecsync,
} from "./api.ts";

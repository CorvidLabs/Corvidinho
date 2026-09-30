import { get, register } from "../../src/plugins/registry.ts";
import { shellCommands } from "./commands.ts";

export function loadShellPlugins(): void {
  const first = shellCommands[0]?.name;
  if (first && get(first)) return;
  for (const cmd of shellCommands) {
    register(cmd);
  }
}

export { shellCommands };
export {
  firstDisallowedCd,
  forEachSimpleCommand,
  isCdEscape,
  stripQuotes,
  clampRefuseMessage,
} from "./clamp.ts";
export { firstFootgun, footgunRefuseMessage } from "./footguns.ts";

import { get, register } from "../../src/plugins/registry.ts";
import { filesCommands } from "./commands.ts";

export function loadFilesPlugins(): void {
  const first = filesCommands[0]?.name;
  if (first && get(first)) return;
  for (const cmd of filesCommands) {
    register(cmd);
  }
}

export { filesCommands };
export {
  isProtectedPath,
  isSecretPath,
  protectedRefuseMessage,
  secretRefuseMessage,
} from "./protectedPaths.ts";
export { resolveProjectPath, PathEscapeError } from "./resolvePath.ts";

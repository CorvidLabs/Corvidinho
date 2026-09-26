import { get, register } from "../../src/plugins/registry.ts";
import { autonomousCommands } from "./commands.ts";

/**
 * Register autonomous extras (PLUGIN-5). Registered always so `plugins list`
 * shows them (PLUGIN-6); the tool catalog hides them unless the session is
 * allowed (SAFE-9) and each handler re-checks AUTONOMOUS-1.
 */
export function loadAutonomousPlugins(): void {
  const first = autonomousCommands[0]?.name;
  if (first && get(first)) return;
  for (const cmd of autonomousCommands) {
    register(cmd);
  }
}

export { autonomousCommands };
export { createDelegateCommand, DELEGATE_COMMAND_NAME } from "./commands.ts";
export type { DelegateCommandDeps } from "./commands.ts";

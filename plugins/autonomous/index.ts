import { get, register } from "../../src/plugins/registry.ts";
import { autonomousCommands } from "./commands.ts";
import { councilCommands } from "./council.ts";

/**
 * Register autonomous extras (PLUGIN-5): `delegate` (AUTONOMOUS-5) and
 * `council` (AUTONOMOUS-6). Registered always so `plugins list` shows them
 * (PLUGIN-6); the tool catalog hides them unless the session is allowed
 * (SAFE-9) and each handler re-checks AUTONOMOUS-1.
 */
export function loadAutonomousPlugins(): void {
  for (const cmd of [...autonomousCommands, ...councilCommands]) {
    if (!get(cmd.name)) register(cmd);
  }
}

export { autonomousCommands, councilCommands };
export { createDelegateCommand, DELEGATE_COMMAND_NAME } from "./commands.ts";
export type { DelegateCommandDeps } from "./commands.ts";
export { createCouncilCommand, COUNCIL_COMMAND_NAME } from "./council.ts";
export type { CouncilCommandDeps } from "./council.ts";

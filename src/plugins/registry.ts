import type { PluginCommand, PluginListEntry } from "./types.ts";

const commands = new Map<string, PluginCommand>();

export function register(command: PluginCommand): void {
  if (!command.name || command.name.trim().length === 0) {
    throw new Error("PluginCommand.name must be non-empty");
  }
  if (commands.has(command.name)) {
    throw new Error(`Plugin already registered: ${command.name}`);
  }
  commands.set(command.name, command);
}

export function get(name: string): PluginCommand | undefined {
  return commands.get(name);
}

export function list(): PluginListEntry[] {
  return [...commands.values()]
    .map((c) => ({
      name: c.name,
      description: c.description,
      dangerous: Boolean(c.dangerous),
      minTier: c.minTier ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Test / reload helper — clears the in-process registry. */
export function clearRegistry(): void {
  commands.clear();
}

export function size(): number {
  return commands.size;
}

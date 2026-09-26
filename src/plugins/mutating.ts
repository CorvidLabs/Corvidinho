/**
 * Mutating plugin detection (ROLES-CHAT-5).
 * Mutating = dangerous:true OR explicit mutating flag (write/edit/delete/post/…).
 */

import type { PluginCommand, PluginListEntry } from "./types.ts";

export type MutatingLike = {
  name: string;
  dangerous?: boolean;
  mutating?: boolean;
};

/** True when the plugin can change files, repos, Discord, memory ACL, or config. */
export function isMutatingPlugin(cmd: MutatingLike): boolean {
  if (Boolean(cmd.dangerous)) return true;
  if (Boolean(cmd.mutating)) return true;
  return false;
}

export function listEntryMutating(entry: PluginListEntry): boolean {
  return Boolean(entry.mutating) || Boolean(entry.dangerous);
}

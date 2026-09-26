/**
 * Shared Corvidinho data directory (MEMORY-1 path alignment).
 * Default: ~/.local/share/corvidinho — override with CORVIDINHO_DATA_DIR.
 */

import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_DATA_DIR_REL = ".local/share/corvidinho";

export type DataDirOptions = {
  env?: NodeJS.ProcessEnv;
  home?: string;
};

/**
 * Resolve the local data directory for SQLite and future MEMORY files.
 */
export function resolveDataDir(opts: DataDirOptions = {}): string {
  const env = opts.env ?? process.env;
  const override = env.CORVIDINHO_DATA_DIR?.trim();
  if (override) return override;
  const home = opts.home ?? homedir();
  return join(home, ".local", "share", "corvidinho");
}

export function defaultDbPath(opts: DataDirOptions = {}): string {
  return join(resolveDataDir(opts), "corvidinho.db");
}

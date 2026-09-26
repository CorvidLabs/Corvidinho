/**
 * Shared argv builder for spawning the Corvidinho entrypoint.
 * Always invoke `.ts` via `bun` — never posix_spawn the `.ts` path alone
 * (EACCES on Linux when CORVIDINHO_BIN defaults to src/cli.ts).
 *
 * `--no-env-file`: spawns run with cwd set to a project worktree, and Bun
 * would otherwise auto-load that project's `.env*` into the agent — letting a
 * repo inject allowlists, admin lists or keys. Config comes only from the bot
 * VM env the parent passes explicitly (ALLOW-4 / SAFE-1).
 *
 * `--config=/dev/null`: Bun would likewise read `bunfig.toml` from the spawn
 * cwd, and its `preload` runs arbitrary code with the child's full env before
 * the entrypoint. Pinning Bun config to a known-empty file (Linux-only
 * target) means a project or worktree can never inject runtime config.
 */

/** Known-empty Bun config every `.ts` spawn is pinned to (never the cwd's bunfig). */
export const SPAWN_BUN_CONFIG = "/dev/null";

export function buildCorvidinhoArgv(bin: string, args: string[] = []): string[] {
  if (bin.endsWith(".ts")) {
    return ["bun", "--no-env-file", `--config=${SPAWN_BUN_CONFIG}`, bin, ...args];
  }
  return [bin, ...args];
}

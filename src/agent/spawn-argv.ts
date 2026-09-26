/**
 * Shared argv builder for spawning the Corvidinho entrypoint.
 * Always invoke `.ts` via `bun` — never posix_spawn the `.ts` path alone
 * (EACCES on Linux when CORVIDINHO_BIN defaults to src/cli.ts).
 *
 * `--no-env-file`: spawns run with cwd set to a project worktree, and Bun
 * would otherwise auto-load that project's `.env*` into the agent — letting a
 * repo inject allowlists, admin lists or keys. Config comes only from the bot
 * VM env the parent passes explicitly (ALLOW-4 / SAFE-1).
 */

export function buildCorvidinhoArgv(bin: string, args: string[] = []): string[] {
  if (bin.endsWith(".ts")) {
    return ["bun", "--no-env-file", bin, ...args];
  }
  return [bin, ...args];
}

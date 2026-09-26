/**
 * Shared argv builder for spawning the Corvidinho entrypoint.
 * Always invoke `.ts` via `bun` — never posix_spawn the `.ts` path alone
 * (EACCES on Linux when CORVIDINHO_BIN defaults to src/cli.ts).
 */

export function buildCorvidinhoArgv(bin: string, args: string[] = []): string[] {
  if (bin.endsWith(".ts")) {
    return ["bun", bin, ...args];
  }
  return [bin, ...args];
}

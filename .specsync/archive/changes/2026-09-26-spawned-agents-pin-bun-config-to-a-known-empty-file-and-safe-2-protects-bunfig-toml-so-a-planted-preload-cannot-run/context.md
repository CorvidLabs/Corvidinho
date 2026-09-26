---
change: spawned-agents-pin-bun-config-to-a-known-empty-file-and-safe-2-protects-bunfig-toml-so-a-planted-preload-cannot-run
artifact: context
---

# Context

A bug sweep (plugins-exec-1) found that the #133 spawn isolation (`bun --no-env-file`) only stopped `.env*` loading. Bun also reads `bunfig.toml` from the spawn cwd, and its `preload` runs arbitrary code with the child's full env (DISCORD_TOKEN, GITHUB_TOKEN, LLM and audit keys) before `src/cli.ts`. Discord talk spawns reuse the session worktree as cwd and WATCH spawns use the project root, so a bunfig planted by `files-write` (non-dangerous, not SAFE-2 protected) or committed by a project repo ran on the next spawn without SAFE-1 consent.

Repro before the fix: a temp project with `bunfig.toml` (`preload = ["./p.ts"]`) and `p.ts` printing an env var; `Bun.spawn(buildCorvidinhoArgv(bin), { cwd: proj })` printed the preload line with the token. Adding `--config=<file>` suppressed it.

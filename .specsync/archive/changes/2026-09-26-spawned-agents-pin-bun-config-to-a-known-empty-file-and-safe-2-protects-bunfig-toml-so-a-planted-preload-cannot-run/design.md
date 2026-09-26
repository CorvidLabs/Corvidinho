---
change: spawned-agents-pin-bun-config-to-a-known-empty-file-and-safe-2-protects-bunfig-toml-so-a-planted-preload-cannot-run
artifact: design
---

# Design

- `buildCorvidinhoArgv` returns `["bun", "--no-env-file", "--config=/dev/null", bin, ...args]` for `.ts` bins (exported `SPAWN_BUN_CONFIG`). `/dev/null` is a known-empty file that always exists on the Linux-only target and cannot be written by a project, so the spawn never reads a project or worktree bunfig. Non-`.ts` bins are unchanged.
- All spawn sites (Discord and WATCH agent clients, protocol handshake, delegate workers) already go through `buildCorvidinhoArgv`, so one change covers them.
- Defense in depth: `isProtectedPath` treats basename `bunfig.toml` / `.bunfig.toml` (any directory, case-insensitive) as SAFE-2 protected infra, so files-write/edit/delete refuse them; the refusal message lists bunfig.toml.
- No new env vars, flags or slash commands.

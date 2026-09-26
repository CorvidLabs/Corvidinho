# Lesson bundle — spawned-agents-pin-bun-config-to-a-known-empty-file-and-safe-2-protects-bunfig-toml-so-a-planted-preload-cannot-run

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Spawned agents pin Bun config to a known-empty file and SAFE-2 protects bunfig.toml so a planted preload cannot run code in the agent (#133 isolation / SAFE-1)
- **Kind**: BugFix
- **Specs**: agent, plugins
- **Paths**: src/agent/spawn-argv.ts, plugins/files/protectedPaths.ts, tests/spawn.argv.test.ts, tests/files.plugins.test.ts, tests/autonomous.delegate.test.ts
- **Acceptance**: A bunfig.toml preload in the spawn cwd never runs in a spawned .ts agent (argv is bun --no-env-file --config=/dev/null <bin>); files-write/edit/delete refuse bunfig.toml and .bunfig.toml (SAFE-2)

## Evidence

- Verification commit: `958c53e482ea0f7432768a112e7cdd189055b3d5`
- Base commit: `cfcf2b7c6ab71ed46ce4f319969c26bc3c599c0f`
- Verified by: `specsync check --spec agent --spec plugins`

## From the change's context.md

# Context

A bug sweep (plugins-exec-1) found that the #133 spawn isolation (`bun --no-env-file`) only stopped `.env*` loading. Bun also reads `bunfig.toml` from the spawn cwd, and its `preload` runs arbitrary code with the child's full env (DISCORD_TOKEN, GITHUB_TOKEN, LLM and audit keys) before `src/cli.ts`. Discord talk spawns reuse the session worktree as cwd and WATCH spawns use the project root, so a bunfig planted by `files-write` (non-dangerous, not SAFE-2 protected) or committed by a project repo ran on the next spawn without SAFE-1 consent.

Repro before the fix: a temp project with `bunfig.toml` (`preload = ["./p.ts"]`) and `p.ts` printing an env var; `Bun.spawn(buildCorvidinhoArgv(bin), { cwd: proj })` printed the preload line with the token. Adding `--config=<file>` suppressed it.

## From the change's design.md

# Design

- `buildCorvidinhoArgv` returns `["bun", "--no-env-file", "--config=/dev/null", bin, ...args]` for `.ts` bins (exported `SPAWN_BUN_CONFIG`). `/dev/null` is a known-empty file that always exists on the Linux-only target and cannot be written by a project, so the spawn never reads a project or worktree bunfig. Non-`.ts` bins are unchanged.
- All spawn sites (Discord and WATCH agent clients, protocol handshake, delegate workers) already go through `buildCorvidinhoArgv`, so one change covers them.
- Defense in depth: `isProtectedPath` treats basename `bunfig.toml` / `.bunfig.toml` (any directory, case-insensitive) as SAFE-2 protected infra, so files-write/edit/delete refuse them; the refusal message lists bunfig.toml.
- No new env vars, flags or slash commands.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-133` | `tests/spawn.argv.test.ts` | `.ts` argv is `bun --no-env-file --config=/dev/null <bin>`; a `bunfig.toml` preload in the spawn cwd does not run in the child and the child's env token is not printed (failed on main with `PRELOAD RAN token=fake-token-123`). |
| `REQ-agent-133` | `tests/autonomous.delegate.test.ts` | delegate worker argv starts `bun --no-env-file --config=/dev/null <bin>`. |
| `REQ-plugins-083` | `tests/files.plugins.test.ts` | `isProtectedPath` is true for `bunfig.toml`, `sub/pkg/bunfig.toml`, `.bunfig.toml` and mixed case; files-write of `bunfig.toml`, `.bunfig.toml`, `sub/bunfig.toml` is refused (exit 2, SAFE-2) and no file is created (failed on main). |

## Where these lessons go

- `specs/agent/context.md`
- `specs/plugins/context.md`

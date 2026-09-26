# Lesson bundle — spawned-agents-ignore-the-project-env-and-tests-never-create-real-worktrees-allow-4-safe-1-session-worktree-3-hygiene

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Spawned agents ignore the project .env and tests never create real worktrees (ALLOW-4 / SAFE-1 / SESSION-WORKTREE-3 hygiene): bun-invoked spawns pass --no-env-file so a project worktree's .env cannot inject allowlists, admin lists or keys into the agent; bridge and slash fixture tests use temp project roots so bun test never adds talk/* worktrees or branches to the repo
- **Kind**: BugFix
- **Specs**: agent
- **Paths**: src/agent/spawn-argv.ts, tests/spawn.argv.test.ts, tests/discord.bridge.cli.test.ts, tests/discord.thinking-bridge.test.ts, tests/discord.slash.test.ts, specs/agent/
- **Acceptance**: buildCorvidinhoArgv invokes .ts entrypoints as bun --no-env-file <bin> so a .env in the spawn cwd (project worktree) never reaches the spawned agent; config comes only from the parent's explicit env (ALLOW-4, SAFE-1); a fixture proves a cwd .env value does not reach the child; bridge and slash fixture tests use temp non-git project roots so bun test creates no talk/* worktrees or branches in the repo; fixture tests + SpecSync + fledge verify green

## Evidence

- Verification commit: `9ce144c2e7a1247cd5d0eb03b7520eb049af7925`
- Base commit: `c3b4d8881ea2d9a5b968eb47b9eda35c6e1b2233`
- Verified by: `specsync check --spec agent`

## From the change's context.md

# Context

Found while reviewing PR #128: spawns run with cwd = the talk's project
worktree (#70), and Bun auto-loads `.env*` from the cwd into any variable the
parent left unset. Verified: a repo `.env` with `CORVIDINHO_ALLOWLIST=memory-forget`
reached the child. That lets a worked-on repo inject allowlists (SAFE-1 / ALLOW),
admin lists or keys into the agent — config must come from the bot VM (ALLOW-4).

Separately, an end-to-end probe found `bun test` created real `talk/sess_*`
worktrees + branches next to the repo: bridge and slash fixtures used
`process.cwd()` (the repo) as the project root.

## From the change's design.md

# Design

One-line argv change in `src/agent/spawn-argv.ts` (shared by Discord/WATCH
agent clients and the protocol handshake). Non-`.ts` bins are unchanged.
Tests pass `projectRoot` / `defaultProjectRoot` = `mkdtempSync(...)`.

## From the change's testing.md

# Testing

- `tests/spawn.argv.test.ts`: argv shape; cwd `.env` value not visible to child.
- Full `bun test` leaves `git branch --list 'talk/*'` unchanged.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-agent-133 | `tests/spawn.argv.test.ts`; bridge/slash fixtures with temp roots |

## Where these lessons go

- `specs/agent/context.md`

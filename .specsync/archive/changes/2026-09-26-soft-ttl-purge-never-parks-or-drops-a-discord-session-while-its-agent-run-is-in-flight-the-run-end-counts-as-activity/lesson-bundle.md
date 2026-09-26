# Lesson bundle — soft-ttl-purge-never-parks-or-drops-a-discord-session-while-its-agent-run-is-in-flight-the-run-end-counts-as-activity

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Soft-TTL purge never parks or drops a Discord session while its agent run is in flight; the run end counts as activity (SESSION-2, SESSION-WORKTREE-3)
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: src/discord/session-store.ts, src/discord/command-handlers/work.ts, src/discord/command-handlers/session.ts, src/discord/bridge.ts, tests/discord.session-worktree.test.ts
- **Acceptance**: A session whose agent run is in flight (bridge chat, /work, /session start) is never dropped or worktree-parked by the soft-TTL purge on get/getByThread/getByBotMessage/list; the run end refreshes lastActivityAt; an idle session past the TTL after its run still purges and parks; fixture tests with a real temp git repo and injected clock

## Evidence

- Verification commit: `719cfa09c6058f943c7bf8ce66ee79c718d5a60d`
- Base commit: `cfcf2b7c6ab71ed46ce4f319969c26bc3c599c0f`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Found in a Discord bug sweep (discord-4, severity high). `SessionStore`
drops a session whose `lastActivityAt` is older than the soft TTL (~45m) on
any lookup (`get`, `getByThread`, `getByBotMessage`, `list`) and
fire-and-forgets `parkSessionWorktree`, which runs
`git worktree remove --force` (or removes the scoped dir). Nothing touched
the session while `agent.runChat` ran, so a /work, /session start or chat run
longer than the TTL lost its live worktree as soon as anyone ran /status or
/session list, or sent a message that did a thread/reply lookup. The agent's
uncommitted edits were destroyed mid-run, /work still said "completed", and
the Worktree line vanished. On the bridge path the run then threw a SQLite
FOREIGN KEY error when it tracked the bot reply for the dropped session row.

Repro (fixture, real temp git repo, injected clock): the agent writes
`half-done.ts`, the clock moves 46 minutes, `store.list()` runs mid-run, and
the worktree and the file are gone.

HI: SESSION-2 (activity keeps the session), SESSION-WORKTREE-3 (park only an
ended or abandoned talk, never live work). No new env vars or slash commands.

## From the change's design.md

# Design

- `SessionStore` keeps a private `activeRuns` map (session id → count of
  runs in flight).
- New `SessionStore.runActive(session, fn)`: marks the session busy, awaits
  `fn`, then un-marks it and `touch()`es the session (the end of a run is
  activity, SESSION-2). The touch is skipped when the session is no longer
  the live one in the store (already ended), so an ended talk is never
  re-persisted.
- `purgeIfExpired` returns early for a busy session, so no lookup drops or
  parks it while its agent runs (SESSION-WORKTREE-3).
- The three `agent.runChat` call sites (bridge mention/reply/thread path,
  `/work`, `/session start`) wrap the call in `store.runActive`. Nothing
  else changes: TTL value, lookup semantics for idle sessions, park/end
  paths, schema, env, and slash surfaces stay as they are.

## From the change's testing.md

# Testing

tests/discord.session-worktree.test.ts, describe "soft-TTL purge never parks a
busy session (REQ-discord-204)": each case uses a temp git repo, a temp
`WORKTREE_BASE_DIR` and an injected clock. The agent writes `half-done.ts`
into its cwd, moves the clock by TTL + 1 minute, then calls `store.list()`
(what /status and /session list do) and `store.get()`.

Before the fix: 4 fail (worktree and edit gone mid-run; /work reply lost the
Worktree line; bridge threw SQLite FOREIGN KEY when tracking the bot reply;
`runActive` missing). After the fix: 9/9 pass in the file.

Plus `bun test`, `bunx tsc --noEmit`, `specsync check --require-coverage 100`
and `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | Test | Evidence |
| --- | --- | --- |
| REQ-discord-204 | tests/discord.session-worktree.test.ts › /work: a lookup past the TTL mid-run keeps the worktree and the agent's edits | worktree and half-done.ts survive a mid-run `list()`; reply keeps `Worktree:`; session touched at run end |
| REQ-discord-204 | tests/discord.session-worktree.test.ts › /session start: a lookup past the TTL mid-run keeps the worktree | worktree and edit survive; reply keeps `Worktree:` |
| REQ-discord-204 | tests/discord.session-worktree.test.ts › bridge mention: a lookup past the TTL mid-run keeps the worktree | worktree and edit survive; reply-to-bot still maps to the live session (no FOREIGN KEY error) |
| REQ-discord-204 | tests/discord.session-worktree.test.ts › once the run ends, an idle session past the TTL is still purged and parked | busy session kept past the TTL; idle past the TTL after the run → purged and worktree removed |

## Where these lessons go

- `specs/discord/context.md`

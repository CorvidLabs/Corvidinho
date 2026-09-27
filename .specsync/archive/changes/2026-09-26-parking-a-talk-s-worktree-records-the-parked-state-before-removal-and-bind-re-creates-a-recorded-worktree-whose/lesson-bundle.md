# Lesson bundle — parking-a-talk-s-worktree-records-the-parked-state-before-removal-and-bind-re-creates-a-recorded-worktree-whose

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Parking a talk's worktree records the parked state before removal and bind re-creates a recorded worktree whose directory is gone, so a crash between park and row delete never leaves a dead cwd (SESSION-WORKTREE-3)
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: src/discord/session-store.ts, src/discord/bridge.ts, tests/discord.session-worktree.test.ts
- **Acceptance**: Parking a session worktree persists worktree_state=parked before any removal side effect, so a crash between park and row delete never restarts with a row that says active at a removed directory; a park cut short (row parked, path recorded) is finished when the talk ends; bindWorktree re-creates a recorded active worktree whose directory is gone for the same project and session (never the repo root or another talk dir; project switch still refused); the bridge binds on every turn so a thread continue after restart runs in an existing worktree; fixture tests with a real temp git repo and a reopened DB file fail before and pass after

## Evidence

- Verification commit: `cb80548c1708f062fa26ba61795e79bd9cebcbb7`
- Base commit: `213900d3875250f6d845b036d9eebc1ab7e1d4b1`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Found in a crash/restart-recovery audit of `origin/main` (213900d).
`SessionStore.endSession` awaits `parkSessionWorktree` (which runs
`git worktree remove --force` or removes the scoped dir) and only then
deletes the `discord_sessions` row. `parkSessionWorktree` changed
`worktreeState` in memory only and never wrote it to SQLite. A crash in that
window (for example during bridge startup restart recovery, which ends each
abandoned /work talk with `endSession`) left a row with
`worktree_state = 'active'` whose `worktree_path` pointed at a removed
directory.

After restart the session reloaded as live. `bindWorktree` trusted any
`active` row without checking the directory, and the bridge did not even call
it on a continue when `worktreePath` was set; `cwdFor` returned the dead
path, so every turn in that thread failed to spawn until the soft TTL
expired.

Repro (fixture, real temp git repo, DB file reopened as a restart): after
`parkSessionWorktree` the row still said `active`; after reopen,
`bindWorktree` returned ok with the removed path and the bridge ran the agent
with a cwd that did not exist.

HI: SESSION-WORKTREE-3 (ending/abandoning a talk parks its worktree safely;
no silent leftover reused as cwd). SESSION-WORKTREE-4 (no silent project
switch) must keep holding on the re-bind. No new env vars, slash commands, or
schema changes.

## From the change's design.md

# Design

- New private `SessionStore.persistWorktreeState(session)`: an `UPDATE` of
  the row's `worktree_path`, `worktree_branch`, `worktree_state`. UPDATE only,
  so a row already deleted by an ended talk or a TTL purge is never
  re-inserted.
- `parkSessionWorktree` sets `worktreeState = "parked"` and persists it
  synchronously, before `parkWorktree` starts any removal. After the removal
  it records the final state (`removed`/`parked`, path cleared) the same way.
  The early return now skips only `removed`: a `parked` row that still
  records a path is a park cut short by a crash, and parking is idempotent,
  so it is finished.
- `bindWorktree` reuses a recorded `active` worktree only when its directory
  exists. The project-switch refusal still runs first. A missing directory
  falls through to the existing `ensureTalkWorkspace` path for the session's
  own project and id (same `talk-<id>` dir; `cleanStaleWorktreeState` prunes
  the stale entry and keeps a branch with commits as
  `<branch>-parked-<ms>`). It never returns the repo root or another talk's
  directory.
- The bridge calls `bindWorktree` on every turn (it is idempotent) instead of
  only on start or when no path is recorded, so a thread continue after a
  restart goes through that check. On bind failure it ends the talk and
  replies as before. The button-ask pick path (`onComponent`, from #198)
  likewise binds on every turn instead of only when no path is recorded;
  its bind-failure handling is unchanged.
- Untouched: schema (v4 columns already exist), `cwdFor` logic, TTL, slash
  commands, env vars.

Persisted data risk: rows now pass through `parked` while a park is in
flight. Every reader already treats non-`active` as not bound, so the only
effect is that a restarted talk re-binds a fresh worktree.

## From the change's testing.md

# Testing

tests/discord.session-worktree.test.ts, describe "a crash between park and
row delete never leaves a dead cwd (SESSION-WORKTREE-3 / REQ-discord-357)":
each case uses a temp git repo, a temp `WORKTREE_BASE_DIR` and a SQLite file
that is reopened with a fresh `SessionStore` to model a restart. Temp dirs
(and the talk/* branches inside the temp repo) are removed in `finally`.

Before the fix: 4 fail (row still `active` after the park; a `parked` row
with its directory left was skipped on end; bind handed back the removed
directory; the bridge ran the agent in a cwd that did not exist). After the
fix: 13/13 pass in the file.

After merging main (#198 added the button-ask pick path, which bound only
when no worktree path was recorded): a fifth case drives a button pick on a
`parked` row after restart. Before binding on that path too it ran the agent
in the repo root (1 fail); after, 14/14 pass in the file.

Plus `bun test`, `bunx tsc --noEmit`, `specsync check --require-coverage 100`
and `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | Test | Evidence |
| --- | --- | --- |
| REQ-discord-357 | tests/discord.session-worktree.test.ts › parking records the parked state before removal; after a crash the talk re-binds a fresh worktree | row reads `parked` synchronously after `parkSessionWorktree` starts; after reopen the talk is not `active`, bind gives an existing worktree that is not the repo root |
| REQ-discord-357 | tests/discord.session-worktree.test.ts › a park cut short before removal is finished when the talk ends after restart | row `parked` with its dir still present; `endSession` after reopen removes the dir and the row |
| REQ-discord-357 | tests/discord.session-worktree.test.ts › bind re-creates a recorded active worktree whose directory is gone (same project, never the repo root) | `active` row at a removed dir: project switch still refused; bind re-creates an existing worktree for the same project and persists it |
| REQ-discord-357 | tests/discord.session-worktree.test.ts › bridge: a thread continue after restart never spawns in a removed worktree | thread continue after reopen runs the agent in an existing worktree, not the repo root |
| REQ-discord-357 | tests/discord.session-worktree.test.ts › bridge: a button pick after restart never runs in the repo root or a parked worktree | button-ask pick on a `parked` row after reopen re-binds; the agent runs in an existing worktree, not the repo root, and the row reads `active` at it |

## Where these lessons go

- `specs/discord/context.md`

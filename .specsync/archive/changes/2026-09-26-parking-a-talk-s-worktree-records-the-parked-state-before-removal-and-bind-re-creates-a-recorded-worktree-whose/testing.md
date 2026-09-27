---
change: parking-a-talk-s-worktree-records-the-parked-state-before-removal-and-bind-re-creates-a-recorded-worktree-whose
artifact: testing
---

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

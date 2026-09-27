---
change: parking-a-talk-s-worktree-records-the-parked-state-before-removal-and-bind-re-creates-a-recorded-worktree-whose
artifact: context
---

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

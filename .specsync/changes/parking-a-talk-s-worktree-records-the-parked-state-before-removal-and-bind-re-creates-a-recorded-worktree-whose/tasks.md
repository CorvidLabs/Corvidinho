---
change: parking-a-talk-s-worktree-records-the-parked-state-before-removal-and-bind-re-creates-a-recorded-worktree-whose
artifact: tasks
---

# Tasks

- [x] Regression fixtures in tests/discord.session-worktree.test.ts (fail before, pass after).
- [x] `persistWorktreeState` (UPDATE only); `parkSessionWorktree` persists `parked` before removal and the final state after.
- [x] Finish a park cut short (`parked` with a recorded path) instead of skipping it.
- [x] `bindWorktree` re-creates a recorded `active` worktree whose directory is gone; project-switch refusal kept.
- [x] Bridge binds on every turn.
- [x] Spec delta REQ-discord-357.

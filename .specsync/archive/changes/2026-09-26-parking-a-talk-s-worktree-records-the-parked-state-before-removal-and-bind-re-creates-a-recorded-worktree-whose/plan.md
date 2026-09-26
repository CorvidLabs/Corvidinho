---
change: parking-a-talk-s-worktree-records-the-parked-state-before-removal-and-bind-re-creates-a-recorded-worktree-whose
artifact: plan
---

# Plan

1. Regression fixtures in `tests/discord.session-worktree.test.ts` (real temp
   git repo, DB file reopened as a restart); confirm they fail on main.
2. `SessionStore`: persist `parked` before removal and the final state after;
   finish a park cut short; `bindWorktree` re-creates a missing recorded
   worktree.
3. Bridge binds on every turn.
4. Delta REQ-discord-357; `specsync check`; `bun test`; `tsc`; fledge verify;
   draft PR.

---
module: discord
change: parking-a-talk-s-worktree-records-the-parked-state-before-removal-and-bind-re-creates-a-recorded-worktree-whose
---

# Delta — discord (park state survives a crash; no dead cwd)

## Added

### REQUIREMENT REQ-discord-357

Parking a Discord session's worktree SHALL persist `worktree_state = parked`
on its session row before any removal side effect, and the final state once
the removal is done, without re-inserting a row that was already deleted. A
crash between the park and the row delete SHALL NOT leave a row that restarts
as `active` at a removed directory (SESSION-WORKTREE-3). A park cut short
(row `parked` with its path still recorded) SHALL be finished when the talk
ends. Binding a session SHALL reuse a recorded `active` worktree only when its
directory exists; otherwise it SHALL re-create the worktree for the same
session and project through the existing worktree manager, never falling back
to the repo root or another talk's directory, and a different project SHALL
still be refused (SESSION-WORKTREE-4). The bridge SHALL bind on every turn
(a chat continue and a button-ask pick alike) so a turn after a restart never
spawns in a missing directory, a parked worktree, or the repo root.

Acceptance Criteria
- The row reads `parked` as soon as a park starts, before the worktree is removed.
- After a restart, a talk whose park finished or was cut short is not `active`; its next turn runs in an existing worktree that is not the repo root.
- A `parked` row whose directory is still there is removed when the talk ends.
- An `active` row at a removed directory is re-bound to an existing worktree for the same project; a different project is refused.
- A button-ask pick after a restart on a `parked` row runs in an existing worktree that is not the repo root.
- No new env vars, slash commands, or schema changes.

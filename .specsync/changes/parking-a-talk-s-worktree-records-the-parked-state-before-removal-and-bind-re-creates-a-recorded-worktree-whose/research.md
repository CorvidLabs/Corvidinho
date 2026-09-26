---
change: parking-a-talk-s-worktree-records-the-parked-state-before-removal-and-bind-re-creates-a-recorded-worktree-whose
artifact: research
---

# Research

- Callers of `parkSessionWorktree`: `endSession` (bridge bind failure,
  `/session start` and `/work` bind failure, startup restart recovery),
  `purgeIfExpired`, and expired rows in `loadFromDb`. The last two delete the
  row synchronously right after the call, so the pre-removal UPDATE lands
  before the delete and the post-removal UPDATE is a no-op.
- The code before the first `await` in an async function runs synchronously,
  so the `parked` marker is on disk before `parkWorktree` spawns git.
- `createWorktree` already runs `cleanStaleWorktreeState` (prune, force
  remove a leftover dir, park a branch with commits, delete an empty one), so
  re-creating the same `talk-<id>` worktree needs no new manager code.
- Only the bridge continues an existing talk; `/session start` and `/work`
  always create a fresh session and bind it before `cwdFor`.

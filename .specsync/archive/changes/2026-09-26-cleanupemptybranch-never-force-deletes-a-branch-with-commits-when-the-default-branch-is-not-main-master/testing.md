---
change: cleanupemptybranch-never-force-deletes-a-branch-with-commits-when-the-default-branch-is-not-main-master
artifact: testing
---

# Testing

`tests/worktree.test.ts` builds a real temp git repo whose default branch is
`trunk` (no `main` or `master`), with `WORKTREE_BASE_DIR` under the temp
root. Before the fix the new test fails (the parked `talk/worked` branch is
gone: expected its commit sha, received empty); after the fix it passes, and
the rest of `bun test` stays green.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-203` | `tests/worktree.test.ts` › default branch 'trunk': branch with commits survives cleanup, clean branch is deleted | `talk/worked` commits `work.txt` in its worktree and is parked with `parkWorktree`; the worktree dir is gone and `refs/heads/talk/worked` still points at the run's commit. |
| `REQ-discord-203` | `tests/worktree.test.ts` › default branch 'trunk': branch with commits survives cleanup, clean branch is deleted | `talk/clean` has no commits off HEAD; `removeWorktree(..., { cleanBranch: true })` deletes it, and `talk/worked` is still at its commit afterwards. |

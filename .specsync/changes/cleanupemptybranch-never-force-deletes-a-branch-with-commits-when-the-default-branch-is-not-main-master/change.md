---
id: cleanupemptybranch-never-force-deletes-a-branch-with-commits-when-the-default-branch-is-not-main-master
state: implementing
type: bug_fix
base_commit: 0f81c13648593457803513b59068008ddd07d6db
---

# CleanupEmptyBranch never force-deletes a branch with commits when the default branch is not main/master

## Intent

cleanupEmptyBranch never force-deletes a branch with commits when the default branch is not main/master

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- removing or parking a talk worktree with branch cleanup deletes the branch only when it has no commits off the project HEAD, and any git error keeps the branch; in a repo whose default branch is trunk (no main or master) a branch with a commit survives remove and park, and a branch with no commits of its own is still deleted

## No-spec Rationale

Not applicable

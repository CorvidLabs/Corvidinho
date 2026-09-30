---
module: discord
change: in-a-specsync-repo-it-opens-and-works-a-specsync-change-for-its-edits-and-on-corvidinho-it-approves-and-archives-its
---

# Delta: discord (/work checks SpecSync change coverage before commit and push — AGENT-18)

## Added

### REQUIREMENT REQ-discord-518

/work SpecSync coverage (AGENT-18, REQ-agent-518). Before `openWorkPr`
commits or pushes anything, after the tests-deleted check (REQ-discord-185)
and before the pre-push lane, it SHALL read the repo's SpecSync policy with
`scanRepoWays(worktree, mergeBase)` (the merge-base, HEAD and the work tree,
merged fail-closed) and, when it requires a change for meaningful files,
SHALL list the paths changed since the merge-base (commits and the dirty
tree, `startWorkspaceDiffFrom(worktree, mergeBase).changed()`) and require
each meaningful one to be covered by an open change or by a change archived
on the branch (`sddUncovered`). An uncovered path, or changes that cannot be
read, SHALL keep the PR from opening with reason `sdd-uncovered` and one
scrubbed `PR: not opened — …` line that counts and names the paths (five,
then "…"), says to open a change with `specsync change new … --path`, and
says the changes stay on the work branch; no plugin runs and nothing is
committed or pushed. Turning the workflow off on the branch does not skip
the check. No env var, config key, flag or slash command.

Acceptance Criteria
- A /work worktree of an SDD repo with `src/app.ts` edited and no change: `opened: false`, reason `sdd-uncovered`, the line names `src/app.ts`, no plugin call; after a change archived on the branch covers it: opened through `git-commit` → `git-push` → `github-pr-create`.
- A branch that deletes `sdd.json` and commits the edit still gets `sdd-uncovered`.

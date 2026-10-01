---
change: in-a-hi-repo-it-never-changes-the-criteria-itself-any-hi-change-no-approved-capture-made-blocks-done-and-the-pr-agent
artifact: design
---

# Design

- **repo-ways.ts** gains the hi guard section: `parseHiEntries` (criteria /
  retired bullets with continuation lines, front matter skipped),
  `hiChangesSince(root, base)` (`git diff --name-only -z --no-renames
  base -- hi` plus `git ls-files --others -z -- hi`, through `runGit`, so
  committed, dirty, untracked and ignored paths all count; each changed
  `hi/*.md` is parsed at `base` via `git cat-file` and in the working tree,
  no symlink followed), `hiSnapshot` / `hiChangesFromSnapshot` for a run
  with no git base (lstat walk, sha256 per file, stat past the read cap,
  2000-entry cap, unreadable = null), `hiChangeCount`, `hiChangeSummary`,
  `hiGuardNote`, `HI_GUARD_UNREADABLE_NOTE`, `HI_NO_CAPTURE_YET`. Every
  changed path lands in exactly one list, so classification never decides
  whether to block: any change blocks. `SddRun.hiStart` holds the planning
  snapshot when `base` is null. `renderRepoWaysBlock`'s hi text adds the
  refusal and the block.
- **loop.ts**: the scan now (start scan merged with a fresh one) is read once
  per verify; `sddGateNote` takes it; `hiGateNote` runs beside it. Both notes
  (one Text each) join as the failed verify's output and the retry's whole
  feedback; no lane runs. A throw fails closed when the way is on. Only
  attempts with something to verify are checked (a run that changed nothing
  stays "nothing to verify").
- **pr.ts**: after the SpecSync coverage check, before the fallback
  re-verify and every plugin call, `hiChangesSince(cwd, mergeBase)`;
  refusal reason `hi-changed`.
- **plugins/files**: `isHiPath` and `hiRefuseMessage` in protectedPaths.ts;
  `refuseHi` in commands.ts checks the resolved and given path first (cheap)
  and only then `repoWaysNow(cwd)`, after `refuseProtected` in write, edit
  and delete. Not folded into `isProtectedPath`, which is repo-agnostic and
  shared by other tools.
- **hidden edits**: `git diff` trusts the index for assume-unchanged and
  skip-worktree entries and asks a configured fsmonitor which files changed,
  so a dirty hi/ edit could hide from it. `hiChangesSince` runs git with
  `core.fsmonitor=false` (as the AGENT-15 workspace diff does) and adds each
  flagged `hi/` entry (`git ls-files -v -s`) whose file on disk is not its
  index blob; a skip-worktree entry missing from disk is a sparse checkout,
  not a change.
- **github-pr-create inside a run** (REQ-plugins-521): the model can open a
  PR itself through the GitHub tools, so the handler asks `hiPrRefusal(cwd)`
  before the client and the GITHUB-9 review: with a run in progress in `cwd`
  (the in-process run ledger) in a hi repo, `hiRunChanges` (the gate's own
  comparison) must be empty. With no run there (an operator's own call, the
  `/work` PR step, which checks the merge-base itself) it does not apply.
- **the note's advice**: the run cannot tell who made a hi/ change that was
  already there, so the note says to undo only a change this run made and to
  leave one that was already there for the owner and say so (the stuck ask
  then reaches the owner) — it never tells the model to revert someone
  else's capture.
- **Corvidinho's own captures**: nothing hooks git, CI, the verify lane or
  `spec-check`, so captures made with the `hi` CLI outside any run (this PR's
  coordinator flow) are never checked by themselves. Inside a run the guard
  compares with the session base: a capture already there (on the remote's
  default branch, or in HEAD at planning when there is none) never blocks,
  but a hi/ commit on the run's own branch that is not yet on the default
  branch counts whoever made it, since the run cannot tell (a design choice
  pending Leif).

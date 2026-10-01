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
- **Corvidinho's own captures**: nothing hooks git, CI, the verify lane or
  `spec-check`; commits made outside a Corvidinho run are never checked.

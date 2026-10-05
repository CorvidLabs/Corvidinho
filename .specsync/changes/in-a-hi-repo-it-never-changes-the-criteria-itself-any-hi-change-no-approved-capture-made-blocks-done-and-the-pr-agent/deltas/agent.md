---
module: agent
change: in-a-hi-repo-it-never-changes-the-criteria-itself-any-hi-change-no-approved-capture-made-blocks-done-and-the-pr-agent
---

# Delta: agent (in a hi repo any hi/ change no approved capture made blocks done — AGENT-18 hi guard)

## Added

### REQUIREMENT REQ-agent-520

hi guard (AGENT-18, captured on main from Leif's 2026-09-28 interview: "It
works each repo's own way: …; where it uses hi, it drafts criteria and asks
before capturing, never inventing them; …"; this builds the guard half of the
hi clause). In a repo that uses hi (the start scan merged with a scan now,
`mergeScans`: a `hi/*.md` with `hi:` front matter in the session base, HEAD
or the working tree), when an attempt has something to verify, `runTask`
SHALL, beside the SpecSync coverage check (REQ-agent-518) and before the
lane, compare everything under `hi/` with the session base
(`hiRunChanges(cwd, run)` → `hiChangesSince(cwd, base)` in
`src/agent/repo-ways.ts`: `git diff --name-only base -- hi`, so committed and
uncommitted changes both count, plus `git ls-files --others -- hi`, ignored
files included; git never consults a configured fsmonitor there, and an
assume-unchanged or skip-worktree `hi/` index entry whose file on disk is not
its index blob SHALL count too, while a skip-worktree entry missing from disk
(a sparse checkout) SHALL not; for a run with no git session base,
`hiChangesFromSnapshot` against `hiSnapshot` taken at planning into the run
ledger's `hiStart`). Each changed `hi/*.md` SHALL be
parsed on both sides (`parseHiEntries`: `- **ID**  text` bullets and their
deeper-indented continuation lines, `## Retired` marking retired entries)
so the note names criteria added, removed or reworded and retired entries
changed (retiring a criterion included); every other changed `hi/` path, or
a changed file whose entries did not change, SHALL count as an other-file
change. Since no run can make an approved capture yet (drafting criteria and
the capture card are a later change), any change in any of the three lists,
made by this run or left by an earlier one, SHALL make the attempt a failed
verify with no lane run: one Text note `hi guard: this repo's hi/ changed
since the session base (criteria …; retired entries …; other hi/ files …)
and no approved capture made the change, …` (five ids or paths per kind,
then "…"; `hiGuardNote`), which SHALL tell the model to undo a hi/ change
this run made and to leave one that was already there for the owner and say
so (the run cannot tell who made it), a `VerifyResult` with `success: false`, the note
as the retry's whole feedback after its "Verification failed" head (joined
with a SpecSync gate note when both apply), and after the retries the failed
result with the stuck ask. A hi/ diff or snapshot that cannot be read SHALL
fail closed (`HI_GUARD_UNREADABLE_NOTE`). The tool loop's hi block
(`renderRepoWaysBlock`) SHALL also say that the file tools refuse every
write, edit and delete under `hi/`, that any hi/ change since the session
base keeps the run from being verified and `/work` from opening a PR, and
that no run can make an approved capture yet. A run that changed nothing is
not checked. The guard runs only inside Corvidinho runs (this gate,
`github-pr-create` inside a run, REQ-plugins-521) and `/work`'s PR step
(REQ-discord-520): a capture made with the `hi` CLI outside any run that is
already in the session base (on the remote's default branch, or in HEAD at
planning when the repo has none) never blocks, but a `hi/` commit on the
run's own branch that is not yet on the remote's default branch counts as a
change whoever made it, since the run cannot tell.
No env var, config key, flag, NDJSON field or schema.

Acceptance Criteria
- `parseHiEntries` reads criteria, sub-criteria and retired entries (with their continuation lines) and no entries from front matter or prose.
- `hiChangesSince` sorts a reworded criterion (criteria), a retired one (retired), an intent-prose edit (files), a committed new criterion plus an untracked note and an ignored swap file, and a deleted hi file correctly; `hiChangesFromSnapshot` does the same for a non-git project.
- An attempt that edits `hi/agent.md` outside the file tools gets the `hi guard:` note, no lane call and a failed `VerifyResult`; the retry's feedback carries the note; once hi/ is put back the lane runs once and the run is verified.
- An assume-unchanged and a skip-worktree `hi/agent.md` edited on disk (which `git diff` no longer shows) still count; a skip-worktree hi file missing from disk does not.
- The `hi guard:` note says to undo a hi/ change this run made and leave one that was already there for the owner.
- A leftover dirty hi/ edit blocks a run that only touched `src/`; a criterion committed mid-run is still seen; a hi/ change that stays ends failed with the stuck ask; a non-git hi project is blocked the same way.
- No false block: hi/ untouched, a `hi/` without front matter, and a capture committed on main outside any run before the talk branched all end verified.
- `tests/agent.hi-guard.test.ts` fails on the base sources and passes after.

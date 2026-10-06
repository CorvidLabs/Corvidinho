---
module: plugins
change: where-a-repo-uses-hi-it-drafts-criteria-and-asks-the-owner-on-a-card-before-capturing-them-agent-18-hi-drafts
---

# Delta: plugins (the hi/ refusal names the owner's card and hi-draft — AGENT-18 hi drafts)

## Modified

### REQUIREMENT REQ-plugins-520

AGENT-18 hi guard: in a repo that uses hi (`repoWaysNow(cwd)`: a `hi/*.md`
with `hi:` front matter in the run's session base, HEAD or the working
tree), `files-write`, `files-edit` and `files-delete` SHALL refuse every
path under `hi/` (`isHiPath` on where the write would land, symlinks
resolved by `resolveProjectPath`, and on the path as given), after the
SAFE-2 check and before anything is read or written, with exit 2 and one
line (`hiRefuseMessage`): `refused (AGENT-18): '<path>' is under hi/, where
this repo keeps its acceptance criteria. The agent never changes them itself:
criteria change only through a capture the owner approves on a card, and any
other hi/ change keeps the run from being verified and /work from opening a
PR. Reading hi/ is fine; draft a missing criterion with hi-draft where this
run has it, …`. There SHALL be no in-band override. Reads
(`files-read`, `files-list`, `files-glob`) and `hi/` in a repo that does
not use hi SHALL be unaffected.

Acceptance Criteria
- In a temp hi repo, `files-write` (relative, `./`, absolute, a new file), `files-edit` and an allowlisted `files-delete` under `hi/` refuse with `refused (AGENT-18)` and leave the file unchanged; `files-read hi/agent.md` and a write to `src/app.ts` work.
- A write through a symlink that lands in `hi/` is refused.
- In a repo whose `hi/` has no hi front matter the write goes through; a non-git hi project refuses.
- `tests/agent.hi-guard.test.ts` fails on the base sources and passes after.
- The refusal says criteria change only through a capture the owner approves on a card, and points at `hi-draft` (AGENT-18 hi drafts).


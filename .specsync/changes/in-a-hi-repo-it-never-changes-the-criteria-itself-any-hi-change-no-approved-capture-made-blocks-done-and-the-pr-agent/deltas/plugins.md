---
module: plugins
change: in-a-hi-repo-it-never-changes-the-criteria-itself-any-hi-change-no-approved-capture-made-blocks-done-and-the-pr-agent
---

# Delta: plugins (file tools refuse hi/ in hi repos — AGENT-18 hi guard)

## Added

### REQUIREMENT REQ-plugins-520

AGENT-18 hi guard: in a repo that uses hi (`repoWaysNow(cwd)`: a `hi/*.md`
with `hi:` front matter in the run's session base, HEAD or the working
tree), `files-write`, `files-edit` and `files-delete` SHALL refuse every
path under `hi/` (`isHiPath` on where the write would land, symlinks
resolved by `resolveProjectPath`, and on the path as given), after the
SAFE-2 check and before anything is read or written, with exit 2 and one
line (`hiRefuseMessage`): `refused (AGENT-18): '<path>' is under hi/, where
this repo keeps its acceptance criteria. The agent never changes them itself:
criteria change only through a capture the owner approves, which no run can
make yet, and any hi/ change keeps the run from being verified and /work
from opening a PR. …`. There SHALL be no in-band override. Reads
(`files-read`, `files-list`, `files-glob`) and `hi/` in a repo that does
not use hi SHALL be unaffected.

Acceptance Criteria
- In a temp hi repo, `files-write` (relative, `./`, absolute, a new file), `files-edit` and an allowlisted `files-delete` under `hi/` refuse with `refused (AGENT-18)` and leave the file unchanged; `files-read hi/agent.md` and a write to `src/app.ts` work.
- A write through a symlink that lands in `hi/` is refused.
- In a repo whose `hi/` has no hi front matter the write goes through; a non-git hi project refuses.
- `tests/agent.hi-guard.test.ts` fails on the base sources and passes after.

### REQUIREMENT REQ-plugins-521

AGENT-18 hi guard, the PR a run opens itself: `github-pr-create` SHALL,
after its usage and repo checks and before the GitHub client, the GITHUB-9
review and anything sent to GitHub, ask `hiPrRefusal(cwd)`
(`src/agent/repo-ways.ts`). While a Corvidinho run is in progress in `cwd`
(the run ledger, `currentSddRun`) in a repo that uses hi (`repoWaysNow`),
and anything under `hi/` differs from that run's session base
(`hiRunChanges`: the same comparison as the verify gate, REQ-agent-520), it
SHALL refuse with exit 2 and one line `refused (AGENT-18): this repo's hi/
changed since the session base (criteria …; retired entries …; other hi/
files …) and no approved capture made the change, so this run opens no PR;
…`, and a hi/ diff that cannot be read SHALL refuse the same way ("could not
read what changed under hi/ …"). With no run in progress there (an
operator's own `corvidinho plugins run github-pr-create`, or the `/work` PR
step, which holds hi/ to the merge-base itself, REQ-discord-520) the hi
guard SHALL not apply here. No env var, config key or flag.

Acceptance Criteria
- Inside a run in a temp hi repo, a criterion committed through the shell makes a dry-run `github-pr-create` refuse with `refused (AGENT-18)`, exit 2, naming `criteria AGENT-23` and "this run opens no PR"; with hi/ untouched in a run, it is not refused by the hi guard (the next gate, GITHUB-9, answers).
- With no run in progress, a dirty hi/ edit does not make `github-pr-create` refuse with AGENT-18.
- `tests/agent.hi-guard.test.ts` fails on the base sources and passes after.

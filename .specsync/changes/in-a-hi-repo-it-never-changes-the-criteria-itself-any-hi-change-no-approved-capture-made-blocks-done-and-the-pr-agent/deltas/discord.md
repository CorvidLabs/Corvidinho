---
module: discord
change: in-a-hi-repo-it-never-changes-the-criteria-itself-any-hi-change-no-approved-capture-made-blocks-done-and-the-pr-agent
---

# Delta: discord (/work opens no PR while hi/ differs from the merge-base — AGENT-18 hi guard)

## Added

### REQUIREMENT REQ-discord-520

AGENT-18 hi guard: in a repo that uses hi (`scanRepoWays(cwd, mergeBase)`:
the merge-base, HEAD and the work tree), `openWorkPr` (`src/work/pr.ts`)
SHALL, after the SpecSync coverage check (REQ-discord-518) and before the
pre-push verify re-run, `git-commit` and `git-push`, compare `hi/` with the
merge-base (`hiChangesSince`: committed on the branch or left in the tree,
untracked and ignored files included). When anything differs it SHALL not
open the PR, with reason `hi-changed` and the line `PR: not opened — this
repo's hi/ changed since the branch left <base> (criteria …; retired
entries …; other hi/ files …) and no approved capture made the change; the
agent never changes a repo's criteria itself: … (AGENT-18). The changes stay
on branch <branch>.`; a hi/ diff that cannot be read SHALL refuse the
same way ("could not read what changed under hi/ …"). Because the check
comes before the fallback re-verify, a run result trusted from its frame and
a verify re-run here both hold to it; nothing is committed or pushed.

Acceptance Criteria
- A leftover dirty hi/ edit with a verified run: `hi-changed`, the line names `criteria AGENT-19`, no plugin call.
- A hi/ note committed on the branch with no result frame: `hi-changed` naming `other hi/ files hi/notes.md`, and the verify runner is never called.
- A `/work` run that edits hi/ ends failed and opens no PR; the tree it left is refused even with a trusted verified result; once hi/ is restored the next run is verified and the PR opens.
- `tests/agent.hi-guard.test.ts` fails on the base sources and passes after.

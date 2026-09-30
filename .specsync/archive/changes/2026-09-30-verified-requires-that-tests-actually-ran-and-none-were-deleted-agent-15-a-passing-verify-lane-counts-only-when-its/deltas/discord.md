---
module: discord
change: verified-requires-that-tests-actually-ran-and-none-were-deleted-agent-15-a-passing-verify-lane-counts-only-when-its
---

# Delta: discord (/work checks tests against the merge-base before commit and push — AGENT-15)

## Added

### REQUIREMENT REQ-discord-185

/work none-deleted check (AGENT-15, REQ-agent-185). Before `openWorkPr`
commits or pushes anything (after the run, worktree, branch, allowlist and
repo gates), it SHALL compare the work tree about to be committed and pushed
(commits since the merge-base plus the dirty tree) with the talk branch's
merge-base by test name (`startWorkspaceDiffFrom(worktree, mergeBase)
.testDrops()`, REQ-agent-185), whatever runs made the change. A test deleted,
retitled or turned off since the branch left its base SHALL keep the PR from
opening with reason `tests-deleted` and one scrubbed `PR: not opened — …`
line that says how many tests were deleted or turned off since the branch
left the base branch (named), names each as `"name" (file)` (removed,
retitled, skip, todo, or silenced by only) and says the changes stay on the
work branch; names that cannot be read SHALL do the same with "could not
check that no test was deleted since the branch left" the base branch. A
renamed test file or a moved test keeps its name and does not
block. When the run did not report `verified` and the verify lane is re-run
before the push, a passing lane SHALL also have to show that tests ran
(`judgeTestEvidence`); otherwise reason `verify-failed` with the
`Verify gate: not verified: …` note. No plugin runs and nothing is pushed in
either case. No env var, config key, flag or slash command is added.

Acceptance Criteria
- A /work worktree whose earlier commit on the branch removed a test: `opened: false`, reason `tests-deleted`, the line names `"keeps order" (tests/math.test.ts)` and `main`, no plugin call, no lane run, nothing on the remote.
- A `git mv` rename of the test file with a pre-push lane that prints no test summary: `verify-failed` naming the missing summary, no plugin call; with a `bun test` summary: opened (`pre-push`) through `git-commit` → `git-push` → `github-pr-create`.

---
change: work-opens-a-draft-pr-from-its-verified-worktree-issue-88-autonomous-3-github-2-github-5-agent-4-after-a-work-run-only
artifact: context
---

# Context

Issue #88 (M3 "real dev teammate"): issue → worktree → verify → PR, end to
end. Captured HI: AUTONOMOUS-3 (a work task gets its own git worktree, does
the job, and can open a PR when I allow that path), GITHUB-2 (PR from worktree
work with a description that matches what changed), GITHUB-5 (creating PRs is
dangerous: non-interactive needs an explicit allow), AGENT-2 and AGENT-4/4.a.

What was already on main: `/work` gets its own `talk/<session>` worktree
(SESSION-WORKTREE-1); `task run` plans with the SpecSync briefing (AGENT-2)
and runs verify with retries fed the failure output (AGENT-4/4.a); typed
`git-commit` / `git-push` (#82) and `github-pr-create` (dangerous, attribution
footer) exist. The missing link: nothing ever pushed a finished /work
worktree or opened a PR from it; the reply just said "Done".

In flight elsewhere: #152 / #155 (#85) drop `--no-verify` from the Discord
spawn so /work runs verify in the child. This change does not depend on them:
if the run's result frame does not say `verified`, the PR step runs the verify
lane once itself before shipping.

Out of scope (draft, not acceptance criteria): AUTONOMOUS-14 durable queue,
AGENT-14/15, issue-number branch names / "Closes #N" (no captured id), merging
(#99), buddy review (#92), scans (#91), comment back on the issue.

---
change: work-opens-a-draft-pr-from-its-verified-worktree-issue-88-autonomous-3-github-2-github-5-agent-4-after-a-work-run-only
artifact: requirements
---

# Requirements

REQ-discord-088 (see `deltas/discord.md`): after a `/work` run, open a draft
PR from its git worktree only when the run finished cleanly, the tree passed
the verify lane, the PR path is explicitly allowlisted and the repo passes the
gate; build the body from the real diff; otherwise reply with one plain line.

| HI id | Status in this change |
|-------|-----------------------|
| AUTONOMOUS-3 | Met for /work: own worktree (existing) + PR when the allowlist allows that path |
| GITHUB-2 | Met: PR from worktree work; body from name-status, diffstat, commits, verify |
| GITHUB-5 | Met: `git-commit` / `git-push` / `github-pr-create` must be allowlisted; checked before any step |
| GITHUB-6 | Kept: repo gate before push; plugins re-check |
| AGENT-4 | Kept: no PR unless verify passed; plain line when it failed |
| AGENT-2, AGENT-4.a | Already met by `task run` (SpecSync briefing, retries with failure output) |
| AUTONOMOUS-14, AGENT-14/15 | Draft — left for HI capture |

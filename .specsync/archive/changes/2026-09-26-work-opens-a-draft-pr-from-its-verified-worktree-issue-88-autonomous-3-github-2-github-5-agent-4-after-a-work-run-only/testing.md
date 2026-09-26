---
change: work-opens-a-draft-pr-from-its-verified-worktree-issue-88-autonomous-3-github-2-github-5-agent-4-after-a-work-run-only
artifact: testing
---

# Testing

`tests/work.pr.test.ts` — temp repos under mkdtemp with a local bare
`origin` at `<tmp>/acme/widget.git`; git config isolated; github-pr-create in
`CORVIDINHO_GITHUB_DRY_RUN` or mocked; verify lane mocked. No network, no
tokens, no worktrees or `talk/*` branches in this repo.

| REQ | Case |
|-----|------|
| REQ-discord-088 | Title: first line, collapsed, ≤72, leading `-` stripped; commit message shape |
| REQ-discord-088 | Body lists A/M/D/R files, diffstat, commits, verify line; backtick run gets a longer fence; token scrubbed |
| REQ-discord-088 | Failed run / verify failed in run → no PR, no plugin calls |
| REQ-discord-088 | Scoped dir → "did not run in a git worktree"; clean tree → "none — no changes" |
| REQ-discord-088 | Not allowlisted → names missing plugins, nothing committed/pushed/verified |
| REQ-discord-088 | Repo gate refusal → no plugin calls |
| REQ-discord-088 | Unverified run re-runs verify once in the worktree; failure ships nothing |
| REQ-discord-088 | Dirty verified tree → real commit + push to bare remote + dry-run draft PR; body from real diff |
| REQ-discord-088 | Agent already committed → git-commit not required; re-verify before push; PR URL line |
| REQ-discord-088 | Push failure / PR failure → plain line; empty plugin allowlist still denied (SAFE-1) |
| REQ-discord-088 | Spawn client copies verified/verifySkipped/state from the result frame |
| REQ-discord-088 | /work passes run facts + active worktree to the PR step; `PR:` line above the summary; default step in scoped dir; throwing step never breaks the reply |

Gates: `bunx tsc --noEmit`, `bun test`, `specsync check --require-coverage 100`,
`fledge lanes run verify --non-interactive`.

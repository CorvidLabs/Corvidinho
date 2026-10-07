---
change: github-7-typed-github-pr-merge-merges-the-bot-s-own-green-corvidinho-pr-only-when-ci-is-green-and-branch-protection
artifact: context
---

# Context

- Issue #99 (GITHUB-7 / PROCESS-3,4; M4 Safe autonomy). HI already captured in
  `hi/github.md` GITHUB-7 and AGENTS.md PROCESS-3/4 / merge policy: on
  Corvidinho the agent may merge its own green PRs within branch protection;
  outside Corvidinho humans still merge; never bypass; never merge others'.
- Existing typed GitHub writes: `github-pr-create`, `github-pr-review`,
  issue create/comment, behind GITHUB-6 + SAFE-1 in `plugins/github/commands.ts`.
  CI verdict helpers already in `plugins/github/ciStatus.ts`. Self-repo
  identity: `CORVIDINHO_REPO` / `isCorvidinhoOriginUrl` in
  `src/agent/repo-ways.ts`.
- No merge command yet. Prefer minimal complete GITHUB-7 (tool + specs/docs)
  over wiring auto-merge into `/work` in this slice. No package bump; no
  live bridge restart.

- Also classifies `github-pr-merge` in `STATE_CHANGING_TOOLS` (REQ-agent-086) and drops the STATUS `(this PR)` placeholder.

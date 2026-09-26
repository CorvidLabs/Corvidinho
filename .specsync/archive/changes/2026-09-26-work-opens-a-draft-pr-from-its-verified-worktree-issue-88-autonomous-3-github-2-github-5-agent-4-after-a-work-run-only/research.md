---
change: work-opens-a-draft-pr-from-its-verified-worktree-issue-88-autonomous-3-github-2-github-5-agent-4-after-a-work-run-only
artifact: research
---

# Research

- corvid-agent `server/work/service.ts`: worktree → session → validate →
  retry → push → PR. Corvidinho already has the worktree (SessionStore
  `createWithWorktree`) and the validate/retry loop (`runTask`), so only the
  push → PR tail is missing.
- corvid-agent `server/github/`: PR body template + agent signature. Kept to
  what GITHUB-2 needs (what changed + verify); the attribution footer comes
  from `github-pr-create` (`withAttribution`). Auto-labels not captured.
- `plugins/git` (#82): `git-commit` stages explicit paths only and refuses
  `.env*` / keystores / `.git`; `git-push` pushes the current branch, never
  force, gates the push URL's OWNER/REPO (GITHUB-6). Reused as-is.
- `plugins/github` `github-pr-create`: dangerous, `--draft`,
  `CORVIDINHO_GITHUB_DRY_RUN` for fixtures. Its repo gate is env-only, so the
  PR step pre-checks the same gate before pushing to avoid a pushed branch
  with a refused PR.
- `runPlugin`: dangerous + non-interactive denied unless allowlisted (SAFE-1),
  audit row before the run (SAFE-5). The bridge is always non-interactive.

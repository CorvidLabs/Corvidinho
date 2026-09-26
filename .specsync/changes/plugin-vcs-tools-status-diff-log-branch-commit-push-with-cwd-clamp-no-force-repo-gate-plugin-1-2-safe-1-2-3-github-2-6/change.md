---
id: plugin-vcs-tools-status-diff-log-branch-commit-push-with-cwd-clamp-no-force-repo-gate-plugin-1-2-safe-1-2-3-github-2-6
state: approved
type: feature
base_commit: a49987d653499f40af938f26961c98e017c7777b
---

# PLUGIN vcs tools: status diff log branch commit push with cwd clamp, no force, repo gate (PLUGIN-1/2 SAFE-1/2/3 GITHUB-2/6 issue 82)

## Intent

PLUGIN vcs tools: status diff log branch commit push with cwd clamp, no force, repo gate (PLUGIN-1/2 SAFE-1/2/3 GITHUB-2/6 issue 82)

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- Typed git plugins registered via builtins (PLUGIN-1): git-status (porcelain v1 parsed to JSON), git-diff (worktree or --staged, size-capped), git-log (N oneline), git-branch-list are dangerous=false minTier 0; git-branch-create, git-commit, git-push are dangerous=true minTier 2 and SAFE-1 denied non-interactive unless allowlisted (PLUGIN-2). Every git run uses argv arrays with cwd clamped to the plugin cwd (repo discovery ceiling, must be the worktree root; path args clamped, symlink escapes refused; SAFE-3), GIT_TERMINAL_PROMPT=0, strict flag parsing (unknown flags refused). git-commit requires a message, stages explicit file paths only, refuses staging deletes of SAFE-2 protected paths and .env*/keystore/.git paths, never amends, reports filesChanged. git-push pushes the current branch only, never force (force/delete/mirror/refspec args refused), requires the remote OWNER/REPO to pass checkRepoGate (GITHUB-6), takes credentials only from env/credential helper and redacts URL credentials. Fixture tests with temp git repos and a local bare remote pass without network or live tokens.

## No-spec Rationale

Not applicable

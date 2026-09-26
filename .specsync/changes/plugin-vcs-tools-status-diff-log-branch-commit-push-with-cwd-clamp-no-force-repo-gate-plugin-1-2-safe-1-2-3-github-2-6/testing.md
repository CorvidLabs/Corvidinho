---
change: plugin-vcs-tools-status-diff-log-branch-commit-push-with-cwd-clamp-no-force-repo-gate-plugin-1-2-safe-1-2-3-github-2-6
artifact: testing
---

# Testing

## Local gates

- `bun test` (incl. `tests/git.plugins.test.ts`), `bunx tsc --noEmit`
- `specsync check --require-coverage 100`
- `fledge lanes run verify --non-interactive`

Fixtures: every repo is `git init` inside `mkdtempSync`; the push remote is
a local bare repo at `<tmp>/acme/widget.git`; git config is isolated with
`GIT_CONFIG_GLOBAL` / `GIT_CONFIG_NOSYSTEM`; the repo gate reads
`CORVIDINHO_GITHUB_ALLOW_REPOS` / `DENY_REPOS` and a temp
`CORVIDINHO_ALLOWLIST_FILE`. No network, no live tokens, no real worktrees.
Dangerous runs are audited into the preload-isolated data dir.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-plugins-182 | list markings (dangerous/minTier); non-interactive deny; status/diff/log/branch-list JSON on a temp repo; diff cap; branch-create + refusals; commit explicit paths + filesChanged + refusals (message, directory, escape, .env, protected delete, amend); subdirectory cwd refused; push gate deny/allow, force/refspec refusal, non-fast-forward rejected with remote unchanged, detached HEAD refused; parser unit tests incl. credential redaction |

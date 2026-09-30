---
id: a-cli-task-run-in-a-git-repo-works-in-its-own-worktree-by-default-here-runs-it-in-my-checkout-session-worktree-1-a
state: verifying
type: feature
base_commit: 9ea40051c5cd6841c201e1210319ee621aa4bde0
---

# A CLI task run in a git repo works in its own worktree by default; --here runs it in my checkout (SESSION-WORKTREE-1.a)

## Intent

A CLI task run in a git repo works in its own worktree by default; --here runs it in my checkout (SESSION-WORKTREE-1.a)

## Affected Canonical Specs

- `cli`
- `agent`
- `discord`
- `watch`
- `plugins`

## Acceptance Criteria

- SESSION-WORKTREE-1.a (captured on main from Leif's 2026-09-28 interview, round 9) holds: a local corvidinho task run in a git repo works in its own new linked worktree made from HEAD by ensureTalkWorkspace from the realpath repo top (WORKTREE_BASE_DIR or dirname(repoTop)/.corvid-worktrees, id talk-cli_<uuid prefix>-<digest>, branch talk/cli_...), in the same relative subdirectory; the first event (stderr in text mode, a Text event in --json / ndjson) says it is made from HEAD, that uncommitted and untracked files are not included and nothing is installed there, and that --here runs in this checkout; --here (read only from task run's own args before the first --, never from --task text) runs it in the current checkout; a non-git directory and a child a product surface spawned (role session, WATCH or Discord session, delegate or council worker) stay in place; at run end a clean worktree is removed and its branch deleted only when it has no commits of its own, otherwise what is kept is named on stderr and in the optional additive result.workspace (no protocol bump); a subdir missing in the worktree, an unborn HEAD or any creation failure exits 1 with one scrubbed line and the hint 'pass --here to run in this checkout' and never falls back to the checkout; a SIGINT/SIGTERM while the worktree is made exits 130 and leaves nothing; the Discord, WATCH and delegate/council spawners pass --here; tests/cli.task-worktree.test.ts and the --here assertions in the delegate/council/spawn-client tests fail on the base sources and pass on the branch

## No-spec Rationale

Not applicable

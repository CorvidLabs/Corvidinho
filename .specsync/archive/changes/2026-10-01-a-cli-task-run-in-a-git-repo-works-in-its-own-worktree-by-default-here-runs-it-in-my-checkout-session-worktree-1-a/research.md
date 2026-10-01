---
change: a-cli-task-run-in-a-git-repo-works-in-its-own-worktree-by-default-here-runs-it-in-my-checkout-session-worktree-1-a
artifact: research
---

# Research

- Sources: tracker #122 (body and comments: M2 build order; no
  SESSION-WORKTREE item beyond the captured id), Leif's interview record
  `/home/user/coord/interview-2026-09-28.md` (round 9: `task run` uses a
  per-talk worktree by default in a git repo, `--here` opts into the current
  checkout), the slice entry `/home/user/coord/pr-cli-worktree.json` and the
  cli-worktree rows of `/home/user/coord/m34-defaults.md` (conservative
  defaults, not Leif decisions).
- `ensureTalkWorkspace` (src/worktree/manager.ts) already gives the base
  dir, naming, stale cleanup and the AGENT-15.a verified marker; its non-git
  branch would make a scoped dir, which the CLI must not use (AGENT-1.a: the
  folder itself), so the CLI checks `isGitRepo` first.
- `parkWorktree` removes with `--force`, so the porcelain check must come
  first to never drop uncommitted work; `branchHasOwnCommits` compares with
  the checkout's HEAD and counts a git error as "has commits".
- Every product spawn sets `CORVIDINHO_ACTING_IS_ADMIN` (Discord: `0`/`1`;
  WATCH: `0`), delegate workers carry `CORVIDINHO_DELEGATE_DEPTH`, and the
  daemon uses the Discord spawn client, so an env check covers every child
  even from a bridge that predates `--here`.
- git 2.43 on the box: `git worktree add -b` in a repo with no commit infers
  `--orphan` and succeeds with an empty tree, so the unborn case needs an
  explicit check to fail closed.
- `memory` `projectKeyFor` resolves a linked worktree to the same project
  (origin slug / common dir), so memory scope does not change in a worktree.
- The test suite runs spawned CLIs in temp repos under the preload's temp
  root; a worktree made from one lands in that root's `.corvid-worktrees`,
  which the root's reaper removes. Tests that spawn `task run` in a talk
  worktree need `--here` to keep testing the in-place run.

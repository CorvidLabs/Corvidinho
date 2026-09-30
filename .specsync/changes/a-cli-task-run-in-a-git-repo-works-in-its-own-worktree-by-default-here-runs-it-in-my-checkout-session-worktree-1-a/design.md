---
change: a-cli-task-run-in-a-git-repo-works-in-its-own-worktree-by-default-here-runs-it-in-my-checkout-session-worktree-1-a
artifact: design
---

# Design

- **New module** `src/worktree/cli-run.ts` (owned by the cli spec):
  `enterCliTaskWorkspace({ cwd, here, env, signal })` returns `here`
  (`--here`, `not-git`, `child`) or `worktree` (`cwd`, `dir`, `branch`,
  `repoTop`). Git case: realpath of `git rev-parse --show-toplevel`, the start
  dir's path relative to it, an explicit unborn-HEAD refusal (git ≥ 2.42 would
  otherwise infer `--orphan` and make an empty worktree), then the existing
  `ensureTalkWorkspace({ projectWorkingDir: repoTop, sessionId:
  cli_<uuid> })` — so the base (`WORKTREE_BASE_DIR` or
  `dirname(repoTop)/.corvid-worktrees`), the `talk-<prefix>-<digest>` id,
  `talk/…` branch, stale-state cleanup and the AGENT-15.a verified marker are
  all reused. A missing subdir, a failed create, or an abort discards what was
  made (`removeWorktree` + branch delete only without own commits).
- **Children** (`isSpawnedTaskChild`): `roleSessionActive` (every Discord /
  WATCH spawn sets `CORVIDINHO_ACTING_IS_ADMIN`), a WATCH or Discord session
  id, or delegation depth > 0 stay in place even without `--here` — this
  closes the old-bridge / new-child skew. The spawners also pass `--here`
  (a new bridge with an old child is harmless: the old parser leaves the
  unknown `--here` in `rest`, which `task run` ignores).
- **`--here` parse** (`parseTaskHere`) over `rest.slice(2)` up to the first
  `--`; `parseGlobalFlags` already consumed the `--task` value, so task text
  never reaches it. No global flag.
- **CLI wiring** (`taskRun`): signals are hooked before the worktree is made;
  the start line is a `Text` event (stderr / Text frame / `events`); the body
  moved to `taskRunIn(cwd, …)` with `process.chdir` into the worktree cwd so
  nothing falls back to the checkout; after `runTask` (and before the result
  prints, or in `finally` when the run throws) the process `chdir`s back and
  `finishCliTaskWorkspace` removes a porcelain-clean worktree via
  `parkWorktree` (branch deleted only without own commits) or keeps it; the
  report rides `TaskResult.workspace` and a stderr note.
- **Errors** go through `reportCliError` with `TaskWorkspaceError` (hint
  `CLI_HERE_HINT`, exit 1; cancelled: exit 130).
- **SAFE-3.a**: the gate's local-CLI reason is reworded (it has a worktree
  now, but no role session); the CLI shell half stays later work.

---
change: a-cli-task-run-in-a-git-repo-works-in-its-own-worktree-by-default-here-runs-it-in-my-checkout-session-worktree-1-a
artifact: plan
---

# Plan

1. No `hi` capture (SESSION-WORKTREE-1.a is already on main); `hi check`.
2. `src/worktree/cli-run.ts` and the `task run` wiring in `src/cli.ts`
   (`parseTaskHere`, `TaskWorkspaceError`, `taskRun` / `taskRunIn`).
3. `TaskResult.workspace` (`src/agent/types.ts`).
4. `--here` in the Discord, WATCH and delegate spawn argv.
5. SAFE-3.a local-CLI reason text.
6. Tests: `tests/cli.task-worktree.test.ts`; `--here` on every existing
   spawned `task run` in a git dir; `--here` assertions in the spawn-client,
   delegate and council tests.
7. Fail-on-base proof: swap the base's six modified sources in (new module
   kept), run, restore, run again.
8. Docs, spec prose, deltas, module testing evidence.
9. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`; check the real repo has no
   `talk-cli_*` worktree or `talk/cli_*` branch before and after.

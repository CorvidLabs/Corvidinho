---
change: a-cli-task-run-in-a-git-repo-works-in-its-own-worktree-by-default-here-runs-it-in-my-checkout-session-worktree-1-a
artifact: tasks
---

# Tasks

- [x] Confirm SESSION-WORKTREE-1.a is captured on main; nothing new to capture; `hi check` passes.
- [x] `src/worktree/cli-run.ts`: `enterCliTaskWorkspace`, `finishCliTaskWorkspace`, `isSpawnedTaskChild`, `cliWorkspaceStartLine`, `CLI_HERE_HINT`.
- [x] `src/cli.ts`: `parseTaskHere`, `TaskWorkspaceError`, signals hooked before creation, start line, `chdir`, cleanup before the result prints, help and usage.
- [x] `TaskResult.workspace` / `TaskWorkspaceReport` in `src/agent/types.ts`.
- [x] `--here` in the Discord, WATCH and delegate spawn argv.
- [x] SAFE-3.a local-CLI refusal reason reworded.
- [x] `tests/cli.task-worktree.test.ts`; `--here` on existing spawned task runs; `--here` assertions in spawn-client, delegate and council tests.
- [x] Fail-on-base proof recorded in testing.md.
- [x] README, docs/DISCORD-GO-LIVE.md, docs/discord.md, spec prose, deltas and module testing evidence updated.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green; no `talk-cli_*` worktree or `talk/cli_*` branch left in the real repo.

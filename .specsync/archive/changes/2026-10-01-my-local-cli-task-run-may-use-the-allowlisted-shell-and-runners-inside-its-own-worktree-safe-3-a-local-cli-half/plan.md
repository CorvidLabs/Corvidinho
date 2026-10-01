---
change: my-local-cli-task-run-may-use-the-allowlisted-shell-and-runners-inside-its-own-worktree-safe-3-a-local-cli-half
artifact: plan
---

# Plan

1. No `hi` capture (SAFE-3.a is already on main); `hi check`.
2. `src/agent/shell-gate.ts`: `talkWorktree`, `isCliRunWorktree`,
   `localCliVerdict`, marker checks first.
3. `src/agent/execute.ts`: `talkWorktree` option to the gate.
4. `src/cli.ts`: `taskRun` → `taskRunIn` → `createTaskExecute`; help line.
5. Tests: new `tests/cli.safe3a-shell.test.ts` (gate rows, tool loop, real
   CLI); adjust the local-CLI reason in `agent.safe3a-gate` and
   `agent.safe3a-owner-shell`.
6. Fail-on-base proof: swap the base's three sources in, run, stub the
   missing export, run, restore, run.
7. Docs, spec prose, testing evidence, deltas (REQ-cli-681 Added,
   REQ-agent-503 Modified).
8. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`; the real checkout has no new
   `talk-cli_*` worktree or `talk/cli_*` branch before and after.

---
change: my-local-cli-task-run-may-use-the-allowlisted-shell-and-runners-inside-its-own-worktree-safe-3-a-local-cli-half
artifact: tasks
---

# Tasks

- [x] No new `hi` capture: SAFE-3.a is already captured on main (Leif, 2026-09-28 interview); `hi check` passes.
- [x] `src/agent/shell-gate.ts`: `shellToolsGate({ env, cwd, talkWorktree? })`, `isCliRunWorktree`, `localCliVerdict`, WATCH / schedule markers before the role-session check; `isOwnTalkWorktree` on the shared linked-worktree helper.
- [x] `src/agent/execute.ts`: `CreateTaskExecuteOpts.talkWorktree`, passed to the gate every attempt.
- [x] `src/cli.ts`: `taskRun` passes `ws.dir` (own worktree, no role session) through `taskRunIn` to `createTaskExecute`; help line.
- [x] `src/agent/tools.ts`: `SAFE3A_TOOLS` doc comment.
- [x] Regression tests: `tests/cli.safe3a-shell.test.ts` (11: 5 gate rows, 3 tool loop, 3 real CLI); local-CLI reason updated in `tests/agent.safe3a-gate.test.ts` and `tests/agent.safe3a-owner-shell.test.ts`.
- [x] Fail-on-base proof: base sources swapped in, the new file cannot load and both adjusted cases fail; with the missing export stubbed 10 of 11 fail; restored, all pass.
- [x] Specs: cli (files, invariant, scenario, error row, dependencies, testing), agent (Public API, wiring, invariant, scenario, error row, testing); deltas REQ-cli-681 (Added), REQ-agent-503 (Modified).
- [x] Docs: CLI help, `README.md`, `docs/DISCORD-GO-LIVE.md`, `docs/discord.md`, `STATUS.md`.
- [x] The real checkout has no new `talk-cli_*` worktree or `talk/cli_*` branch (checked before and after).
- [x] SpecSync approve / check / audit / coverage, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.

---
change: if-it-only-plans-or-says-done-without-changing-anything-it-gets-one-nudge-to-the-same-model-a-second-stall-stands-with
artifact: tasks
---

# Tasks

- [x] Confirm AGENT-17 is already captured in `hi/agent.md` (nothing new to capture); `hi check` passes.
- [x] `src/agent/loop-guards.ts`: `isStateChangingTool` (shared with `changedState`), repeat guard `sawChange()`, `stallKind`, `nothingChanged`, nudge text and operator notes, `createStallNudgeGuard`.
- [x] `ExecuteContext.workspaceChanged` (types.ts) passed by `runTask` from its `WorkspaceDiffTracker` (loop.ts).
- [x] `runToolLoop` final-reply branch: one nudge to the same model when the reply stalls, the round offers a state-changing tool, no SAFE-13 trip, not the read tier and nothing changed; later stalls stand with an operator note; one guard per `createTaskExecute`.
- [x] `tests/agent.stall-nudge.test.ts` (units, tool loop, runTask, CLI) with the fake LLM, which now can script tool calls; fixtures in `tests/agent.safe3a-owner-shell.test.ts` and `tests/scheduler.owner-role.test.ts` no longer end on a fake "done" that changed nothing.
- [x] Fail-on-base proof recorded in testing.md.
- [x] docs/discord.md, spec prose, delta and module testing evidence updated.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.

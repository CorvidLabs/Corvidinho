---
change: if-it-only-plans-or-says-done-without-changing-anything-it-gets-one-nudge-to-the-same-model-a-second-stall-stands-with
artifact: plan
---

# Plan

1. No `hi` capture: AGENT-17 is on main already.
2. `src/agent/loop-guards.ts`: `isStateChangingTool` (used by
   `changedState`), `stallKind` / `planWanted`, `changedForStall`,
   `nothingChanged`, nudge text and notes, `createStallNudgeGuard` (which
   remembers a change for the run).
3. `ExecuteContext.workspaceChanged` (types.ts), passed by `runTask`'s
   gate (loop.ts); `createTaskExecute` / `runToolLoop` final-reply wiring.
4. Tests: `tests/agent.stall-nudge.test.ts` with the fake LLM (tool calls
   added to `tests/fixtures/fake-llm.ts`); two fixtures whose fake model
   said "done" after changing nothing now say something that is not a stall.
5. Fail-on-base proof: swap the base's sources in, run, restore, run again.
6. Docs, spec prose, delta and testing evidence.
7. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.

---
change: a-failed-run-tells-the-owner-why-in-one-plain-line-and-everyone-else-that-it-didn-t-work-and-the-owner-has-been-told
artifact: plan
---

# Plan

1. Capture DISCORD-3.b with `hi` in its own commit; `hi check`.
2. Agent side: `TaskResult.error`, `ExecuteResult.failureReason`,
   `modelCallFailedLine`, `runTask` wiring, `stderrTail`.
3. `src/discord/failure-reason.ts`; spawn client fields.
4. Surfaces: bridge chat + ask resume (bodies and throws), `/session start`,
   `/work`, the scheduler post; one shared owner DM in the bridge.
5. Tests: `tests/discord.failed-reply.test.ts`; update the three tests that
   pinned the old `failed (exit N)` line.
6. Fail-on-base proof: swap the base's twelve modified source files in (the
   new module kept), run, restore, run again.
7. Docs, spec prose, deltas and testing evidence.
8. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.

---
change: after-the-one-nudge-a-stalled-run-moves-to-the-next-stronger-model-in-the-order-i-set-and-says-so-agent-17-agent-17-a
artifact: tasks
---

# Tasks

- [x] Capture AGENT-17.a with `hi` (hi/agent.md + INTENT.md index) in its own commit; `hi check` passes.
- [x] `src/agent/providers.ts`: `MODEL_ORDER_ENV`, `modelOrderFromEnv`, `strongerModel`, `moveToStronger`, `StayReason` / `StrongerModel` / `StrongerMove`, `STRONGER_MODEL_NOTE_PREFIX`, `strongerModelNote`, `withStrongerModelNote`.
- [x] `src/agent/loop-guards.ts`: guard `next()` → nudge / escalate / stand with `moved()`; `stallMovedNote`; `stallStandsNote(kind, why)`.
- [x] `src/agent/execute.ts`: `ModelCalls.escalate`; the stall branch drops the stalled reply and sends the same request to the stronger model once per run; the closing note after the fallback note.
- [x] `src/agent/task-summary.ts`: `closingNotesTail` keeps the stronger-model note.
- [x] `src/cli.ts` help, `.env.example`, README, docs/discord.md, docs/DISCORD-GO-LIVE.md document the key; `tests/preload.ts` unsets it.
- [x] `tests/agent.stall-escalate.test.ts`; `tests/agent.stall-nudge.test.ts`, `tests/agent.cli.test.ts`, `tests/preload.operator-data-dir.test.ts`, `tests/fixtures/preload-probe.ts` updated.
- [x] Fail-on-base proof (base sources swapped in, then restored) recorded in testing.md.
- [x] Specs: agent / cli prose, deltas, testing companions; the new test file in the agent spec's files list.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.

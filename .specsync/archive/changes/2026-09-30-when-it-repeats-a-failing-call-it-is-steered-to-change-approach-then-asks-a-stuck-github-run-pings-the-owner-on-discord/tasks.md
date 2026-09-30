---
change: when-it-repeats-a-failing-call-it-is-steered-to-change-approach-then-asks-a-stuck-github-run-pings-the-owner-on-discord
artifact: tasks
---

# Tasks

- [x] Capture AGENT-16.a with `hi` in its own commit; `hi check` passes.
- [x] `src/agent/loop-guards.ts`: `callSignature`, `changedState` with both classification sets, steer / ask text, `createRepeatFailureGuard`.
- [x] `runToolLoop`: guard before dispatch (stuck ask once the steer was seen), count after each result, steer appended after the whole tool message; one guard per `createTaskExecute`, new conversation per attempt.
- [x] WATCH spawn client returns the result frame's `ask`; `src/watch/owner-ask.ts` store, bridge mark and `noteWatchRunAsk`; poller calls it after every finished run.
- [x] Bridge: `src/discord/watch-ask.ts` delivery on the scheduler tick, owner DM, hand-back, retry wait, day give-up; bridge mark set on start and cleared on stop.
- [x] `watch_owner_asks.question` is a SAFE-6 re-scrub target.
- [x] `tests/agent.loop-guards.test.ts` and `tests/watch.stuck-ask.test.ts`; fail-on-base proof recorded in testing.md.
- [x] docs/discord.md, docs/WATCH.md, docs/DISCORD-GO-LIVE.md, spec prose, deltas and module testing evidence updated.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.

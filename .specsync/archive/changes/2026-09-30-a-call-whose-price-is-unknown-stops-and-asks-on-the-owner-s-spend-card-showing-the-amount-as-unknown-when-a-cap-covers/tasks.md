---
change: a-call-whose-price-is-unknown-stops-and-asks-on-the-owner-s-spend-card-showing-the-amount-as-unknown-when-a-cap-covers
artifact: tasks
---

# Tasks

- [x] Read #98 (body, comments, v0.0.36 rollup), the interview record (round 13), pr-spend-caps-c.json and the spend-caps and approvals rows of m34-defaults.md.
- [x] Capture SAFE-16.a with `hi` in its own commit; `hi check` passes.
- [x] `src/agent/spend.ts`: `unknown` ledger status, `unknownCalls`, `covering`, `recordUnknown`, `SPEND_CARD_UNKNOWN_AMOUNT` / `isUnknownSpendAmount`, `spendCardFields` with an unknown amount, the shared `waitOnCard`, `passUnknownOnCard` in the guard.
- [x] `src/agent/spend-notice.ts` (`formatSpend`, `SpendTrip.unknownCalls`, the card variant of `spendCapUnpricedAsk`, "$X + unknown" on doctor / `/status` / warning lines), `src/agent/types.ts` (`SpendWarning.unknownCalls`), `src/agent/spend-outbox.ts` (the warning's unknown count).
- [x] `src/discord/spend-card.ts` (`SPEND_CARD_UNKNOWN_APPROVED`), `src/watch/owner-ask.ts` and `src/discord/watch-ask.ts` (WATCH spend-cap stops, once per cap episode), `src/discord/schedule-ask.ts` + `src/scheduler/store.ts` (Continue, `continued`), comments in `src/scheduler/service.ts` and `src/store/db.ts`.
- [x] Tests: `tests/agent.spend-unknown.test.ts` (18), `tests/spend.surfaces.test.ts` (40); updated `tests/agent.spend-approve.test.ts`, `tests/discord.schedule-ask.test.ts`, `tests/scheduler.ask-block.test.ts` and the `unknownCalls: 0` windows.
- [x] Fail-on-base proof: main's sources swapped in (new files fail; 13 of 40 surface tests fail), a probe on main's APIs; restored, all pass.
- [x] Docs: `docs/discord.md`, `docs/DISCORD-GO-LIVE.md`, `docs/DAEMON.md`, `docs/WATCH.md`.
- [x] Spec: deltas (REQ-agent-199, REQ-discord-199, REQ-watch-099 Added; REQ-agent-098/114/198, REQ-discord-086/198/606, REQ-watch-086 Modified), spec prose and files lists, module testing notes.
- [x] SpecSync approve / check / audit, coverage, `hi check`, tsc, `bun test`, fledge verify.

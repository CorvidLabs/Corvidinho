---
change: a-schedule-s-question-can-be-answered-or-cancelled-by-the-owner-or-its-creator-and-its-next-runs-wait-with-one-note
artifact: tasks
---

# Tasks

- [x] Confirm AUTONOMY-6.a is already captured on main (no new `hi` capture); `hi check` passes.
- [x] Research: where schedule asks are recorded, posted and never answered on main; the reusable ask controls, gates and the #316 `sendDm`.
- [x] Schema v15 in `src/store/db.ts` (columns, index; legacy asks closed, except a still-pending newest one, which blocks and is posted) and the `SCRUB_TARGETS` entry in `src/store/scrub.ts`.
- [x] `src/scheduler/store.ts`: open / close / skip / wait-note / answered-ask store methods; closed asks never pending.
- [x] `src/scheduler/service.ts`: tick skip with no catch-up, one wait note, controls + hint, owner DM for channel-less schedules, hand-back of every in-process ask post, the answer in the next run.
- [x] `src/discord/ask-buttons.ts` (`cancel`), `src/discord/ask-ping.ts` (`hint`), new `src/discord/schedule-ask.ts`, `src/discord/bridge.ts` routing and outbound wiring.
- [x] Tests: new `tests/scheduler.ask-block.test.ts` and `tests/discord.schedule-ask.test.ts`; rewritten `tests/scheduler.ask-outbox.test.ts` and `tests/discord.ask-ping.test.ts`; schema assertions to v15.
- [x] Fail-on-base proof (base sources swapped in: 21 fail and both new files cannot load; restored: 140 pass, 0 fail).
- [x] Docs: `docs/discord.md`, `docs/DAEMON.md`, `docs/DISCORD-GO-LIVE.md`, `docs/BOX-UPDATE.md`.
- [x] Spec: deltas (REQ-discord-606 Added; REQ-discord-045, 347, 353, 548 Modified), `discord.spec.md` prose, files list, scenario and changelog, `specs/discord/testing.md`.
- [x] SpecSync approve / check / audit, coverage, `hi check`, tsc, `bun test`, fledge verify.

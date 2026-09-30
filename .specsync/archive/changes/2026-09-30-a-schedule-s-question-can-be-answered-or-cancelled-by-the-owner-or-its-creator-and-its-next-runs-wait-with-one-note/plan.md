---
change: a-schedule-s-question-can-be-answered-or-cancelled-by-the-owner-or-its-creator-and-its-next-runs-wait-with-one-note
artifact: plan
---

# Plan

1. Confirm AUTONOMY-6.a is on main (`hi/autonomy.md`); capture nothing new;
   `hi check` passes.
2. Schema v15 (`src/store/db.ts`): the eight `schedule_runs` columns, the
   open-ask partial index, closing legacy asks; `SCRUB_TARGETS` gains
   `ask_answer` and `ask_options` (`src/store/scrub.ts`).
3. `src/scheduler/store.ts`: store asks open and blocking with their
   choices; `openAsk`, `openRunAsk`, `closeRunAsk`, `skipForOpenAsk`,
   `pendingWaitNotes` / `claimWaitNote` / `releaseWaitNote`,
   `answeredAsk`; closed asks never pending or taken.
4. `src/scheduler/service.ts`: skip due runs with an open ask; the wait
   note in the delivery pass; controls and hint on every ask post; DM path
   for a channel-less schedule; hand back every in-process ask post that
   does not go out; the answer in the next run's prompt.
5. `src/discord/ask-buttons.ts` (`cancel` kind), `src/discord/ask-ping.ts`
   (`hint`), new `src/discord/schedule-ask.ts` (controls, hints, wait note,
   `handleScheduleAskPress`); `src/discord/bridge.ts` routes `srun_` presses
   and wires `components` + `dm` into the scheduler outbound.
6. Tests: new `tests/scheduler.ask-block.test.ts` and
   `tests/discord.schedule-ask.test.ts`; rewrite
   `tests/scheduler.ask-outbox.test.ts` and the AUTONOMY-2 dedupe harness in
   `tests/discord.ask-ping.test.ts` for the blocking; schema assertions to
   v15. Prove they fail on base and pass on the branch.
7. Docs (`docs/discord.md`, `docs/DAEMON.md`, `docs/DISCORD-GO-LIVE.md`,
   `docs/BOX-UPDATE.md`), spec prose / files / scenario / changelog,
   `specs/discord/testing.md`, deltas.
8. Approve, `change check --commit`, audit, coverage, `hi check`, tsc,
   `bun test`, fledge verify.

---
change: a-message-sent-while-a-run-is-going-waits-for-it-and-stop-or-cancel-stops-the-run-waiting-messages-still-run-after
artifact: tasks
---

# Tasks

- [x] Capture AGENT-3.b with `hi` in its own commit; confirm AGENT-3 / AGENT-3.a on main; tracking issue #122 (no AGENT-3 issue exists).
- [x] `src/discord/run-control.ts`: `SessionRunControl` (enqueue, current, byProgressMessage, busy, stop, noteForgotten, close, settle, onStopped), `isStopRunText`, `RUN_STOPPED_TEXT`, `RUN_STOP_ACK`.
- [x] `src/discord/message-router.ts` / `types.ts`: `RouterDeps.runs`, the `stop_run` route before the thread and bot-message lookups, past the actor and mute/rate gates.
- [x] `src/discord/bridge.ts`: in-session stop, the chat queue turn (row while waiting, re-check after waiting), stopped / closed handling, pick / Answer turn, `stopRunFor`, `close` + `settle` in `stop()`, `noteForgotten` on forget, card pass after a stop.
- [x] `src/discord/slash-types.ts`, `command-handlers/session.ts`, `command-handlers/work.ts`: `runControl` turn, signal, progress map, stopped answer, `/work` failed / no PR.
- [x] `tests/discord.run-queue.test.ts` and `tests/discord.stop-run.test.ts`; fail-on-base proof recorded in testing.md.
- [x] `docs/discord.md`; `discord.spec.md` (files, Public API, Invariants, scenario, error rows); `specs/discord/testing.md`; deltas (Added REQ-discord-301 / 302, Modified REQ-discord-002 / 044).
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.

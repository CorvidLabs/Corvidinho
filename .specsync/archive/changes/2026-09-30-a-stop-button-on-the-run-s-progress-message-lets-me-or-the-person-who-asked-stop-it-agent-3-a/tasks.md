---
change: a-stop-button-on-the-run-s-progress-message-lets-me-or-the-person-who-asked-stop-it-agent-3-a
artifact: tasks
---

# Tasks

- [x] Confirm AGENT-3 / AGENT-3.a / AGENT-3.b on main (nothing new to capture); tracking issue #122.
- [x] `src/discord/run-control.ts`: `buildStopComponents`, `stopRunCustomId`, `parseStopRunCustomId`, `RUN_STOP_PREFIX`, `RUN_STOP_LABEL`, `RUN_STOP_NOT_YOURS`, `RUN_STOP_NOTHING_RUNNING`.
- [x] `src/discord/thinking-status.ts`: `ThinkingStatusOpts.components`; sent / reused, kept on working edits, cleared by `done`, `fail`, `finalizeContent`, `discard`; `ThinkingOutbound.sendEmbed` / `editEmbed` `components`.
- [x] `src/discord/gateway.ts`: `sendEmbed` / `editEmbed` send the components (`null` ⇒ `[]`).
- [x] `src/discord/inflight-replies.ts`: the interrupted notice clears components.
- [x] `src/discord/bridge.ts`: `memoryThinkingOutbound` records components; Stop components on chat and pick / Answer runs; `stopRun`; `pressPassesGates` shared with the ask branch; the `cvstop` branch (`pressStopButton`).
- [x] `src/discord/command-handlers/session.ts` / `work.ts`: Stop components on the progress message.
- [x] Tests: Stop button describes in `tests/discord.stop-run.test.ts` and `tests/discord.thinking-status.test.ts`; Answer form stub expectation in `tests/discord.ask-answer-modal.test.ts`; fail-on-base proof recorded in testing.md.
- [x] `docs/discord.md`; `discord.spec.md` (Public API, Invariants, scenario, error rows); `specs/discord/testing.md`; deltas (Added REQ-discord-303, Modified REQ-discord-302 / 548).
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.

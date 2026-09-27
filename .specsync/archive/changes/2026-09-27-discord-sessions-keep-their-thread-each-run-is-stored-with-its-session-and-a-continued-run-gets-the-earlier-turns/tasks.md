---
change: discord-sessions-keep-their-thread-each-run-is-stored-with-its-session-and-a-continued-run-gets-the-earlier-turns
artifact: tasks
---

# Tasks

- [x] Reproduce on origin/main fc0ed8d: `tests/discord.session-thread.test.ts` (9 of 12 fail; the 3 guards pass).
- [x] Add `src/discord/session-thread.ts` (renderer, budget constants, `answerTurnText`, module-owned `discord_session_turns`).
- [x] `SessionStore`: `recordTurn` / `threadFor`, load + orphan sweep, delete with the session, turn cap.
- [x] Wire replay + recording into the chat path, the button-pick resume, `/session start` and `/work`.
- [x] SAFE-6: scrub on write; `SCRUB_TARGETS` lists `discord_session_turns.content`.
- [x] SAFE-8 / REQ-discord-098: a spend-cap stop records no answer turn (spend guards green).
- [x] Unit tests: `tests/discord.session-thread.unit.test.ts`.
- [x] Delta: Added REQ-discord-072; `specs/discord/discord.spec.md` (files list, Public API, Invariants), `specs/discord/testing.md`, `docs/discord.md`, `STATUS.md`.
- [x] `specsync check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.

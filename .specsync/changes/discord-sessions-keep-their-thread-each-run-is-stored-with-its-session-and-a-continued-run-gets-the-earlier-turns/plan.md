---
change: discord-sessions-keep-their-thread-each-run-is-stored-with-its-session-and-a-continued-run-gets-the-earlier-turns
artifact: plan
---

# Plan

1. Reproduce on origin/main with bridge-level tests (recording agent, fake
   gateway): reply / @mention / restart / slash / button-pick / scrub cases
   fail; TTL, multi-user and confirm-token guards pass.
2. `src/discord/session-thread.ts`: turn type, budget constants, pure
   renderer (`formatSessionThread` / `withSessionThread`), `answerTurnText`,
   `ensureSessionTurns` (module-owned table).
3. `SessionStore`: in-memory turns per session, `recordExchange` (scrub,
   clip, cap, best-effort DB write), `threadFor`, load/sweep on open,
   delete with the session.
4. Wire the four entry points in `bridge.ts` and the slash handlers; add the
   table to `SCRUB_TARGETS`.
5. Unit tests for the renderer and store; run the spend-cap guards.
6. Delta REQ-discord-072, spec files list / Public API / Invariants,
   testing.md, docs/discord.md, STATUS.md; SpecSync, tsc, bun test, fledge.

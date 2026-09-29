---
change: discord-a-press-on-an-ask-that-is-no-longer-open-timed-out-and-dropped-when-a-newer-ask-was-picked-or-its-session-ttl
artifact: plan
---

# Plan

1. Regression tests in `tests/discord.ask-ephemeral.test.ts` and
   `tests/discord.ask-button-gates.test.ts` (fail on main `310861f`).
2. `SessionStore`: `ClosedAsk`, `CLOSED_ASKS_MAX`, `closeAsks` from
   `clearPendingAsk` / `purgeIfExpired` / `loadFromDb`, `findClosedAsk`.
3. `onComponent`: the late-press reply after the gates, before not-for-you.
4. Delta Modified REQ-discord-045; spec Public API + invariant; testing.md
   evidence; `docs/discord.md` ask paragraph.
5. `specsync change check --commit`, `specsync check --require-coverage
   100`, `hi check`, `bunx tsc --noEmit`, `bun test`,
   `fledge lanes run verify --non-interactive`.

---
change: discord-a-press-on-an-ask-that-is-no-longer-open-timed-out-and-dropped-when-a-newer-ask-was-picked-or-its-session-ttl
artifact: tasks
---

# Tasks

- [x] Repro on main: a press on a dropped timed-out ask and on an ask of a TTL-purged session get "not for you (or already answered)".
- [x] Regression tests that fail on main (`tests/discord.ask-ephemeral.test.ts`, `tests/discord.ask-button-gates.test.ts`).
- [x] `SessionStore`: closed asks (askId, user, expiry) from drop, late clear, runtime purge and load purge; `findClosedAsk`; bounded.
- [x] `onComponent`: requester's press on a closed ask gets ephemeral `ASK_CHOICE_EXPIRED` after the gates; others keep not-for-you.
- [x] Delta Modified REQ-discord-045; spec Public API + invariant; testing evidence; `docs/discord.md`.
- [x] Verify: specsync check, hi check, tsc, bun test, fledge verify lane.

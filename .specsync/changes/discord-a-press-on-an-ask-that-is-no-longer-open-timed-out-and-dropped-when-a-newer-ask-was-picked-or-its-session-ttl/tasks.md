---
change: discord-a-press-on-an-ask-that-is-no-longer-open-timed-out-and-dropped-when-a-newer-ask-was-picked-or-its-session-ttl
artifact: tasks
---

# Tasks

- [x] Repro on main: a press on a dropped timed-out ask and on an ask of a TTL-purged session get "not for you (or already answered)".
- [x] Regression tests that fail on main (`tests/discord.ask-ephemeral.test.ts`, `tests/discord.ask-button-gates.test.ts`).
- [x] `SessionStore`: closed asks (askId, user, expiry, the talk's channel and thread) from drop, late clear, runtime purge and load purge; `findClosedAsk`; bounded.
- [x] `onComponent`: the channel gate judges a closed ask by its talk's channel and thread (DISCORD-2.a); the requester's press on it gets ephemeral `ASK_CHOICE_EXPIRED` after the gates; others keep not-for-you.
- [x] Delta Modified REQ-discord-045; spec Public API + invariant; testing evidence; `docs/discord.md`.
- [x] Verify: specsync check, hi check, tsc, bun test, fledge verify lane.

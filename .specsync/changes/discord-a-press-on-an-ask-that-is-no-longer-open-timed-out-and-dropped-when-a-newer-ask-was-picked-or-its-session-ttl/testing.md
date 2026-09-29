---
change: discord-a-press-on-an-ask-that-is-no-longer-open-timed-out-and-dropped-when-a-newer-ask-was-picked-or-its-session-ttl
artifact: testing
---

# Testing

Regression tests: `tests/discord.ask-ephemeral.test.ts` (one assertion
changed, five tests added) and `tests/discord.ask-button-gates.test.ts`
(one test added). The bridge runs end to end (dry run, fake gateway,
scripted agent, memory thinking outbound, missing allowlist file); the store
test uses an injected clock and a file DB reopened across a restart.

- Before the fix (main `310861f`'s `src/discord/bridge.ts` and
  `src/discord/session-store.ts` swapped in, plus a one-line
  `CLOSED_ASKS_MAX` export so the test file loads; without it the file
  fails to import): 6 of the 29 tests in the two files fail. The press on the
  dropped ask (the changed "never promoted" test and the new drop test), the
  press on a TTL-purged session's asks, the second press on a still-stored
  expired ask, and the gate-order test all get "This choice isn't for you (or
  it was already answered)" where `ASK_CHOICE_EXPIRED` is expected; the
  store test fails on the missing `findClosedAsk`. The DISCORD-ASK-8 test
  (re-press after a pick, press after cancel, before and after the purge)
  passes on main: it is a guard that the fix does not widen the expired reply.
- After the fix: 29 pass, 0 fail. The other `ask-ephemeral` and
  `ask-button-gates` tests pass unchanged (re-press after a pick and a press
  after cancel still say "already").

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-045` | `tests/discord.ask-ephemeral.test.ts` | "an ask dropped at the newest pick…": after ask B is picked while earlier ask A has timed out, the requester's open and pick on A each get exactly `[{ content: ASK_CHOICE_EXPIRED, ephemeral: true }]`, the agent is not called again and nothing is posted or edited; user-2's press gets the not-for-you reply. "an ask whose session was TTL-purged…": with asks A and B open (neither timed out) and `lastActivityAt` 2 h back, open and pick on each get `ASK_CHOICE_EXPIRED`, no run, `store.list()` is empty, nothing posted; user-2 gets not-for-you before and after the purge. "a still-stored ask past its timeout…": the first pick gets `ASK_CHOICE_EXPIRED` and clears the ask, a second open gets `ASK_CHOICE_EXPIRED` again, user-2 gets not-for-you, one run in all. "DISCORD-ASK-8 holds…": a re-press of a picked ask and a press on a cancelled ask get not-for-you, before and after the session is purged. The "never promoted" test now expects `ASK_CHOICE_EXPIRED` for the dropped ask. The store test: `findClosedAsk` is `{ askId, userId, expiresAt }` (no "Which DB?" / "Postgres") for a dropped ask, a late-cleared ask, both asks of a purged session and an ask of a row purged on reload; undefined for a pick, a cancel and a re-stored askId; with `CLOSED_ASKS_MAX + 1` purged the first is forgotten. |
| `REQ-discord-045` | `tests/discord.ask-button-gates.test.ts` | "a muted or deny-listed requester's press on a TTL-purged ask…": muted → `[{ content: MUTED, ephemeral: true }]`; deny-listed → the zero-width ack; once unmuted and un-denied → `ASK_CHOICE_EXPIRED`; one run in all, nothing sent. |

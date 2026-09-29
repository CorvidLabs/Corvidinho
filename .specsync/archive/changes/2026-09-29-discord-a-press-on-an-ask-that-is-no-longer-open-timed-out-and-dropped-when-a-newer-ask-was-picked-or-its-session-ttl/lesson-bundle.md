# Lesson bundle — discord-a-press-on-an-ask-that-is-no-longer-open-timed-out-and-dropped-when-a-newer-ask-was-picked-or-its-session-ttl

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Discord: a press on an ask that is no longer open (timed out and dropped when a newer ask was picked, or its session TTL-purged) replies "that choice expired" with no agent run (DISCORD-ASK-5, REQ-discord-045)
- **Kind**: Feature
- **Specs**: discord
- **Paths**: src/discord/bridge.ts, src/discord/session-store.ts, tests/discord.ask-ephemeral.test.ts, tests/discord.ask-button-gates.test.ts, docs/discord.md
- **Acceptance**: DISCORD-ASK-5 (Button prompts expire after about 30 minutes; a late press gets a short 'that choice expired'): the requester's Choose or option press on an ask that timed out and was dropped, not promoted, when a newer ask of the session was picked, and on an ask whose session was TTL-purged (idle past the SESSION-2 soft TTL, at runtime or at load after a restart), gets the ephemeral ASK_CHOICE_EXPIRED ('that choice expired'), no agent run, no new session and nothing posted, instead of 'This choice isn't for you (or it was already answered)'. A still-stored ask past its timeout keeps today's ASK_CHOICE_EXPIRED reply and is cleared, and a second press on it is still ASK_CHOICE_EXPIRED. DISCORD-ASK-8 holds: a re-press after a pick and a press after cancel stay no-ops with today's reply, also after the session is purged. Another user's press on a live ask, or on an ask that is no longer open, gets the not-for-you reply and resumes nothing (DISCORD-ASK-2/3). The channel, actor and mute/rate gates (REQ-discord-212/201/010) stay ahead of the late-press reply, and the channel gate judges a press on an ask that is no longer open against its session's channel and thread as for a live ask, so it also holds in the talk's thread under an allowlisted channel (DISCORD-2.a). The session store keeps only askId, the session's user, the ask's expiry and the session's channel and thread ids for such asks, in memory, bounded to the newest 1000 (SAFE-6: no question or option text); no new env var, command, table or column.

## Evidence

- Verification commit: `53f2e5df126fb01632b641ba57f51997aea8660e`
- Base commit: `310861f81c5fb0314447109b959b8f37fb323578`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

DISCORD-ASK-5 (hi/discord.md, captured): "Button prompts expire after about
30 minutes; a late press gets a short 'that choice expired'." It is PARTIAL
on main `310861f` (the W11 scoping record for DISCORD-ASK-5): a press on a
still-stored ask past its timeout gets `ASK_CHOICE_EXPIRED`, but two late
presses fall into the unknown-ask branch of `onComponent`
(`src/discord/bridge.ts`) and get "This choice isn't for you (or it was
already answered).":

1. An earlier open ask that timed out and was dropped, not promoted, when the
   newest ask was picked (`clearPendingAsk`, REQ-discord-044 drop rule).
   `tests/discord.ask-ephemeral.test.ts` asserted "already" for exactly this
   press.
2. A press after the session was TTL-purged (`CORVIDINHO_SESSION_TTL_MS`,
   default 45 min idle, clamped 30-60): `purgeIfExpired` (and the load-time
   purge) removes the session with its `pendingAsk` / `openAsks`, so
   `findPendingAsk` finds nothing.

Leif's 2026-09-28 interview plan puts DISCORD-ASK-5 on top of #232 (actor and
mute/rate gates on presses). #232 has since landed on main as `54d6c43`, so
this change branches from main; its gates stay ahead of the new branch.

Constraints: captured HI only (DISCORD-ASK-5, DISCORD-ASK-2/3/8, SESSION-2,
SAFE-6); no new env var, command, table or column; this is not the SESSION-3
post-TTL decision (a press only gets an ack; no session is resumed or
started). A still-stored expired ask keeps today's reply; another user's
press keeps the not-for-you reply.

## From the change's design.md

# Design

- `SessionStore` (`src/discord/session-store.ts`) keeps a memory-only map
  askId → `ClosedAsk { askId, userId, expiresAt, channelId, threadId? }` (no
  question or option text, SAFE-6; the channel and thread ids are the
  session's, for the channel gate), newest last, bounded to `CLOSED_ASKS_MAX` (1000; the
  oldest is forgotten, and a press on it falls back to today's not-for-you
  reply). An ask is closed when:
  1. `clearPendingAsk` drops an earlier open ask past its timeout while the
     newest is cleared (pick, late press or free-text answer);
  2. `clearPendingAsk` clears an ask that is itself past its timeout (the
     bridge's late-press path), so a second late press is still expired;
  3. `purgeIfExpired` purges an idle session: every open ask of it, timed
     out or not;
  4. `loadFromDb` purges a session row past its TTL: every ask in its
     `pending_ask`.
  A pick or answer of a live ask and `setPendingAsk(null)` (cancel) close
  nothing, so DISCORD-ASK-8's re-press and a press after cancel keep today's
  reply. `setPendingAsk` of an askId removes any closed entry for it.
  `findClosedAsk(askId)` runs `list()` first (purge, as
  `findPendingAsk` does) and returns a copy.
- `onComponent` (`src/discord/bridge.ts`): when no open ask matched, it
  looks up `findClosedAsk` first and hands the closed ask's channel and
  thread to `componentChannelAllowlisted` in place of the missing session,
  so a late press in the talk's thread under an allowlisted parent
  (DISCORD-2.a) passes the channel gate exactly as a live press there would,
  and a press elsewhere, or once the talk's channel left the allowlist, stays
  zero-width. After the channel, actor and mute/rate gates and before the
  not-for-you branch, when the closed ask is the presser's, reply the
  ephemeral `ASK_CHOICE_EXPIRED` and return: no clear, no session, no run,
  nothing posted. Another user falls through to the not-for-you reply.
- Rejected: persisting closed asks (needs a table or column); closing picked
  and cancelled asks (would change DISCORD-ASK-8's reply beyond the
  confirmed decisions); an age limit on closed asks (a press days later is
  still late; the count cap bounds memory).

## From the change's testing.md

# Testing

Regression tests: `tests/discord.ask-ephemeral.test.ts` (one assertion
changed, six tests added) and `tests/discord.ask-button-gates.test.ts`
(one test added). The bridge runs end to end (dry run, fake gateway,
scripted agent, memory thinking outbound, missing allowlist file); the store
test uses an injected clock and a file DB reopened across a restart.

- Before the fix (main `310861f`'s `src/discord/bridge.ts` and
  `src/discord/session-store.ts` swapped in, plus a one-line
  `CLOSED_ASKS_MAX` export so the test file loads; without it the file
  fails to import): 7 of the 30 tests in the two files fail. The press on the
  dropped ask (the changed "never promoted" test and the new drop test), the
  press on a TTL-purged session's asks, the second press on a still-stored
  expired ask, and the gate-order test all get "This choice isn't for you (or
  it was already answered)" where `ASK_CHOICE_EXPIRED` is expected; the
  store test fails on the missing `findClosedAsk`; the thread test gets the
  zero-width ack where `ASK_CHOICE_EXPIRED` is expected. The DISCORD-ASK-8 test
  (re-press after a pick, press after cancel, before and after the purge)
  passes on main: it is a guard that the fix does not widen the expired reply.
- Review follow-up: with only `src/discord/bridge.ts` from the first cut of
  this change (`f482a21`, which checked the channel gate against the missing
  session and so judged a thread press by the thread id alone), the thread
  test fails the same way: a late press in the talk's thread got the
  zero-width ack.
- After the fix: 30 pass, 0 fail. The other `ask-ephemeral` and
  `ask-button-gates` tests pass unchanged (re-press after a pick and a press
  after cancel still say "already").

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-045` | `tests/discord.ask-ephemeral.test.ts` | "an ask dropped at the newest pick…": after ask B is picked while earlier ask A has timed out, the requester's open and pick on A each get exactly `[{ content: ASK_CHOICE_EXPIRED, ephemeral: true }]`, the agent is not called again and nothing is posted or edited; user-2's press gets the not-for-you reply. "an ask whose session was TTL-purged…": with asks A and B open (neither timed out) and `lastActivityAt` 2 h back, open and pick on each get `ASK_CHOICE_EXPIRED`, no run, `store.list()` is empty, nothing posted; user-2 gets not-for-you before and after the purge. "a still-stored ask past its timeout…": the first pick gets `ASK_CHOICE_EXPIRED` and clears the ask, a second open gets `ASK_CHOICE_EXPIRED` again, user-2 gets not-for-you, one run in all. "DISCORD-ASK-8 holds…": a re-press of a picked ask and a press on a cancelled ask get not-for-you, before and after the session is purged. The "never promoted" test now expects `ASK_CHOICE_EXPIRED` for the dropped ask. "inside a thread under the allowlisted channel…": in a talk in thread `thr-1` under allowlisted `chan-1`, the requester's open and pick in `thr-1` on the dropped ask and on an ask of the TTL-purged session get `ASK_CHOICE_EXPIRED`, user-2 gets not-for-you, a press from `thr-2` or `chan-off` gets the zero-width ack, and once `chan-1` leaves the allowlist a press in `thr-1` gets the zero-width ack; no run. The store test: `findClosedAsk` is `{ askId, userId, expiresAt, channelId, threadId? }` (no "Which DB?" / "Postgres") for a dropped ask, a late-cleared ask, both asks of a purged session and an ask of a row purged on reload; undefined for a pick, a cancel and a re-stored askId; with `CLOSED_ASKS_MAX + 1` purged the first is forgotten. |
| `REQ-discord-045` | `tests/discord.ask-button-gates.test.ts` | "a muted or deny-listed requester's press on a TTL-purged ask…": muted → `[{ content: MUTED, ephemeral: true }]`; deny-listed → the zero-width ack; once unmuted and un-denied → `ASK_CHOICE_EXPIRED`; one run in all, nothing sent. |

## Where these lessons go

- `specs/discord/context.md`

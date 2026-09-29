---
change: discord-a-press-on-an-ask-that-is-no-longer-open-timed-out-and-dropped-when-a-newer-ask-was-picked-or-its-session-ttl
artifact: design
---

# Design

- `SessionStore` (`src/discord/session-store.ts`) keeps a memory-only map
  askId → `ClosedAsk { askId, userId, expiresAt }` (no question or option
  text, SAFE-6), newest last, bounded to `CLOSED_ASKS_MAX` (1000; the
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
- `onComponent` (`src/discord/bridge.ts`): after the channel, actor and
  mute/rate gates and before the not-for-you branch, when no open ask matched
  and `findClosedAsk` has the askId for the presser, reply the ephemeral
  `ASK_CHOICE_EXPIRED` and return: no clear, no session, no run, nothing
  posted. Another user falls through to the not-for-you reply.
- Rejected: persisting closed asks (needs a table or column); closing picked
  and cancelled asks (would change DISCORD-ASK-8's reply beyond the
  confirmed decisions); an age limit on closed asks (a press days later is
  still late; the count cap bounds memory).

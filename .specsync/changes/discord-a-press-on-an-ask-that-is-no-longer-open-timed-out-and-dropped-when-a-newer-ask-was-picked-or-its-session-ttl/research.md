---
change: discord-a-press-on-an-ask-that-is-no-longer-open-timed-out-and-dropped-when-a-newer-ask-was-picked-or-its-session-ttl
artifact: research
---

# Research

- `onComponent` order on main: parse → `findPendingAsk` (which calls
  `list()`, purging idle sessions) → channel gate → `gateActor` →
  `gateRateOrMute` → "not for you" when there is no session, no ask, or the
  presser is not the session's user → `isAskExpired` → open / pick.
- `clearPendingAsk` drops earlier open asks already past their timeout when
  `pendingAsk` is cleared (so a thin reply never restates dead buttons); the
  dropped asks vanish without a trace.
- `purgeIfExpired` (runtime) and `loadFromDb` (restart) delete the session
  row with its `pending_ask` JSON; `removeLocal` drops every map entry.
- A pick and a cancel also remove asks, and DISCORD-ASK-8 wants a re-press
  after a pick to be a no-op; today that reply is "not for you (or it was
  already answered)", which the existing tests assert.
- Telling "late" from "not yours" needs the ask's owner after the ask is gone.
  The askId alone is not enough: another user's press on a closed ask must not
  learn that it was an ask that expired (DISCORD-ASK-2).
- Persisting closed asks would need a new table or column (or the deleted
  session row), which the change must not add; the load-time purge still sees
  the row's asks, so a restart can close those.

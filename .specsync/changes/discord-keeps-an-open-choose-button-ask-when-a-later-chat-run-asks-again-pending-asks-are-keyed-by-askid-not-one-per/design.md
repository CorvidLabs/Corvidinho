---
change: discord-keeps-an-open-choose-button-ask-when-a-later-chat-run-asks-again-pending-asks-are-keyed-by-askid-not-one-per
artifact: design
---

# Design

- `SessionStub.pendingAsk` keeps its meaning: the newest open ask (thin-ack
  restate, free-text answer, slash handlers and existing readers unchanged).
- New optional `SessionStub.openAsks`: earlier button asks still open under a
  newer `pendingAsk`, oldest first, one per askId.
- `SessionStore.setPendingAsk(session, ask)`: upsert by askId. A new askId
  becomes `pendingAsk`; the superseded ask moves to `openAsks` when it is a
  button ask (has options) and is dropped when it is free text. A held askId
  (e.g. the `stubMessageId` update after posting) is updated in place.
  `null` clears every open ask (explicit cancel, as before).
- `SessionStore.clearPendingAsk(session, askId)`: clear one ask (pick, late
  press, free-text answer, post-run free-text clear); the newest remaining open
  ask is promoted to `pendingAsk`, so "pendingAsk set" still means "an ask is
  open" for the thin-ack/cancel gate.
- `SessionStore.findPendingAsk(askId)`: the live session (via `list()`, which
  purges expired sessions, as the old lookup did) and the matching ask.
- Bridge: `onComponent` looks the press up with `findPendingAsk`, and the
  expired / pick paths clear only the pressed ask; the chat free-text answer
  and the post-run free-text clear use `clearPendingAsk`; cancel still calls
  `setPendingAsk(session, null)`.
- Persistence: `discord_sessions.pending_ask` holds one JSON object when one
  ask is open (unchanged format) and a JSON array (oldest first, newest last)
  when several are. Parse accepts both; an older build reading an array sees
  no pending ask (`askFromUnknown` rejects arrays). No schema version bump.

Alternatives considered: renaming `pendingAsk` to a list (touches every
reader and many tests, conflicts with open PRs); one map keyed by askId with a
derived newest (same persistence, more churn). Chosen: smallest diff that keys
presses by askId.

Design choices pending Leif: cancel clears every open ask (not only the
newest); expired earlier asks are kept (so a late press still gets "that
choice expired") until pressed, cancelled or the session ends — no cap on how
many stay open.

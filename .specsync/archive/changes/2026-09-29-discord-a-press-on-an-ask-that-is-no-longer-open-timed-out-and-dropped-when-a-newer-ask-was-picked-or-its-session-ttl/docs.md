---
change: discord-a-press-on-an-ask-that-is-no-longer-open-timed-out-and-dropped-when-a-newer-ask-was-picked-or-its-session-ttl
artifact: docs
---

# Docs

- `docs/discord.md` (ask section): after the gates, a late press by the
  requester gets "that choice expired" with no run, including an earlier ask
  dropped at a newer pick and an ask of a talk idle past its session TTL;
  someone else's press, a re-press after a pick and a press after `cancel`
  keep "This choice isn't for you (or it was already answered)"; a late
  press passes the same channel gate as a live one (in the talk's thread
  under an allowlisted channel too); closed asks are kept in memory as id,
  owner, expiry and the talk's channel and thread only (newest 1000), and a
  restart forgets them except for talks purged as the store loads.
- `specs/discord/discord.spec.md`: Public API names `ClosedAsk`,
  `CLOSED_ASKS_MAX` and `SessionStore.findClosedAsk`; one invariant line
  for the late-press reply.
- No CHANGELOG / STATUS / package version edits (release PRs own those).

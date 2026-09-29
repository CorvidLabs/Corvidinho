---
change: discord-a-press-on-an-ask-that-is-no-longer-open-timed-out-and-dropped-when-a-newer-ask-was-picked-or-its-session-ttl
artifact: context
---

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

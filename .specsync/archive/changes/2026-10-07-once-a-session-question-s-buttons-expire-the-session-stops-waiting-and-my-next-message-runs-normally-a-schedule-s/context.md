---
change: once-a-session-question-s-buttons-expire-the-session-stops-waiting-and-my-next-message-runs-normally-a-schedule-s
artifact: context
---

# Context

AUTONOMY-6 ("Session stays blocked until a substantive answer or an explicit
cancel.") and AUTONOMY-6.a (a schedule's question blocks its schedule until
the owner or its creator answers or cancels it) are captured on main. A
session's Choose buttons expire after ~30 minutes (DISCORD-ASK-5,
`ASK_BUTTON_TTL_MS`), and since #232 / #264 (REQ-discord-044 / 045) an
expired session button ask is dropped before the thin-reply gate, so the
requester's next message that is not a cancel runs the agent; schedule asks
(REQ-discord-606, schema v15) never lapse. No criterion said which of the two
AUTONOMY-6 readings (stay blocked forever vs. stop waiting at expiry) holds
for session asks.

Leif decided in his 2026-09-28 interview record, round 17 (answered
2026-10-07): "AUTONOMY-5/6 expired session button asks: **keep as built** —
once a session's buttons expire (~30 min) the session stops waiting and the
next message runs normally; schedule questions (AUTONOMY-6.a) still never
expire." This change captures it as AUTONOMY-6.b with `hi` and records it
in docs, spec and tests. Nothing in the bridge's or the scheduler's
behaviour changes: on main (85871fa4) the code already does this, and the new
regression tests pass on main's sources (only the hi/doc citation cases fail
there).

Constraints: specs only through SpecSync; v1 off-chain; #232/#233 scope
untouched; no env var, config key, schema or package version change.

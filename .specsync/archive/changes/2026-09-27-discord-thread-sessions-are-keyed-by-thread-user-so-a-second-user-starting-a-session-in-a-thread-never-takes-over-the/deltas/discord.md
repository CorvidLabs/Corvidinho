---
module: discord
change: discord-thread-sessions-are-keyed-by-thread-user-so-a-second-user-starting-a-session-in-a-thread-never-takes-over-the
---

# Delta — discord (thread sessions keyed by thread + user)

## Modified

### REQUIREMENT REQ-discord-002

The system SHALL continue the same session id when a user replies to a bot message (DISCORD-2). Inside a Discord thread the system SHALL keep one session id for that thread (DISCORD-2.a), one for each user in it (SESSION-MULTI-1, REQ-discord-046).

Acceptance Criteria
- Reply referencing a tracked bot message resumes that session id.
- Thread map keeps one session per thread for each user, keyed by thread id and Discord user id; another user's session in the thread never replaces it.
- The answer message of `/session start` and `/work` is a tracked bot message of the session that slash command created: the thinking message it was collapsed into (DISCORD-ASK-7), or, when collapse fails, the deferred slash reply when the gateway returns its message id.
- After a user runs `/session start` (or `/work`) twice (topics A then B), that user's reply to A's answer resumes session A, with the reply ping on and with it off; it never runs in session B and is never dropped.
- Another user's reply to that answer never resumes the session, even when that user is the configured owner (ADMIN) (SESSION-MULTI-1): with the ping off it is ignored, with the ping on it starts or continues that user's own session.

### REQUIREMENT REQ-discord-046

Concurrent users in one channel SHALL each have their own session keyed by
Discord user id (+ channel / thread). Reply-to-bot and thread continue SHALL
only resume when the message author owns that session. Other users talking
while one has an open button ask SHALL not share history or invalidate the
other's buttons. Memory inject SHALL remain scoped to the acting Discord user.
Inside a thread a plain message SHALL continue the author's own session in
that thread; another user starting a session in the same thread SHALL NOT
take it over (SESSION-MULTI-1/2).

Acceptance Criteria
- Two @mentions from different users yield two session ids.
- A non-owner reply to another user's bot message does not continue that session.
- Same user @mention reuses their active session in the channel.
- In one thread, after user A starts a session and user B then @mentions the bot there (B's own session), A's plain message continues A's session and B's continues B's; neither is ignored nor runs in the other's session.
- The same holds while A has an open button ask (the ask keeps its id and expiry; B's session has none), after B's session ends, and after a restart (sessions reloaded from SQLite).
- A plain message from a user with no session of their own in the thread is ignored; their @mention starts their own session.

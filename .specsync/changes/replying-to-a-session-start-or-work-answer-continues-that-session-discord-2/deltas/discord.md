---
module: discord
change: replying-to-a-session-start-or-work-answer-continues-that-session-discord-2
---

# Delta — discord (a reply to a /session start or /work answer continues that session)

## Modified

### REQUIREMENT REQ-discord-002

The system SHALL continue the same session id when a user replies to a bot message (DISCORD-2). Inside a Discord thread the system SHALL keep one session id for that thread (DISCORD-2.a).

Acceptance Criteria
- Reply referencing a tracked bot message resumes that session id.
- Thread id map keeps one session per thread.
- The answer message of `/session start` and `/work` is a tracked bot message of the session that slash command created: the thinking message it was collapsed into (DISCORD-ASK-7), or, when collapse fails, the deferred slash reply when the gateway returns its message id.
- After the owner runs `/session start` (or `/work`) twice (topics A then B), the owner's reply to A's answer resumes session A, with the reply ping on and with it off; it never runs in session B and is never dropped.
- Another user's reply to that answer never resumes the session (SESSION-MULTI-1): with the ping off it is ignored, with the ping on it starts or continues that user's own session.

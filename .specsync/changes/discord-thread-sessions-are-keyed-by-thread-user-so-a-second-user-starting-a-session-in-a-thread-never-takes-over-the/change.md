---
id: discord-thread-sessions-are-keyed-by-thread-user-so-a-second-user-starting-a-session-in-a-thread-never-takes-over-the
state: draft
type: bug_fix
base_commit: fbaa84b7cda1bf2b462baea44cad20ef93e0df4f
---

# Discord thread sessions are keyed by (thread, user), so a second user starting a session in a thread never takes over the first user's plain-message continuation (SESSION-MULTI-1/2)

## Intent

Discord thread sessions are keyed by (thread, user), so a second user starting a session in a thread never takes over the first user's plain-message continuation (SESSION-MULTI-1/2)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- User A @mentions the bot in a thread and continues with plain messages; user B then @mentions the bot in the same thread and gets a session of their own; A's next plain message in that thread still continues A's session (not ignored, never B's) and B's plain messages continue B's; this holds while A has an open button ask (A's askId and expiry unchanged, B's session has none), after B's session ends, and after a SQLite reload; a third user with no session there is ignored on a plain message and starts their own on @mention; tests/discord.thread-sessions-per-user.test.ts covers all of these and fails on the previous code

## No-spec Rationale

Not applicable

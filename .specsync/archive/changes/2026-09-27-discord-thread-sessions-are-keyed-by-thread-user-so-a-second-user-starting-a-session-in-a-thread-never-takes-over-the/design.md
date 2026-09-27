---
change: discord-thread-sessions-are-keyed-by-thread-user-so-a-second-user-starting-a-session-in-a-thread-never-takes-over-the
artifact: design
---

# Design

- `SessionStore` (`src/discord/session-store.ts`): the thread index
  `byThreadId` (thread id → one session) becomes `byThreadUser`, keyed by
  thread id + Discord user id (`threadUserKey`, NUL-separated). `create`,
  `loadFromDb` and `removeLocal` use that key, so a second user's session
  in a thread gets its own entry and removing one user's session never drops
  another's.
- `getByThread(threadId, userId?)`: with a user, that user's live session in
  the thread (O(1)); without one, the thread's most recently active live
  session, whoever owns it (existing single-argument callers keep working).
  Both purge expired sessions the same way as before (REQ-discord-204 busy
  runs are still never purged).
- `routeMessage` (`src/discord/message-router.ts`) thread path: looks up
  the author's own thread session. The actor gate still refuses a deny-listed
  or unlisted actor silently whenever any session exists in the thread
  (REQ-discord-201, unchanged). A plain message continues only the author's
  own session; with none it falls through as before (a mention starts or
  reuses the author's own session via `getByUserChannel`, which was already
  per user).
- Persistence: the `discord_sessions` rows already carry `thread_id` and
  `user_id`; only the in-memory index changes. No schema bump.

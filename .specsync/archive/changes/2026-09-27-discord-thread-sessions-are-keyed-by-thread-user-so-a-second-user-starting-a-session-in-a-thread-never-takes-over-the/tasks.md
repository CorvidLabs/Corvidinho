---
change: discord-thread-sessions-are-keyed-by-thread-user-so-a-second-user-starting-a-session-in-a-thread-never-takes-over-the
artifact: tasks
---

# Tasks

- [x] Repro on main: A's plain thread message is ignored once B starts a session in the same thread.
- [x] Regression tests in `tests/discord.thread-sessions-per-user.test.ts` that fail with main's `session-store.ts` + `message-router.ts` and pass on the branch.
- [x] Key the `SessionStore` thread index by thread id + user id; `getByThread(threadId, userId?)`.
- [x] Router thread path continues only the author's own thread session; actor gate unchanged.
- [x] Delta: Modified REQ-discord-046 and REQ-discord-002; canonical requirements, `discord.spec.md` (files list, SESSION-MULTI note), `testing.md` and `docs/discord.md` updated.
- [x] `bunx tsc --noEmit`, `bun test`, `specsync check --require-coverage 100`, `fledge lanes run verify --non-interactive` green.

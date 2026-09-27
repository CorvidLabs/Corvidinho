---
change: discord-thread-sessions-are-keyed-by-thread-user-so-a-second-user-starting-a-session-in-a-thread-never-takes-over-the
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-046` | `tests/discord.thread-sessions-per-user.test.ts` | "a second user's session in the thread never takes over the first user's plain-message continuation": A starts + continues in `thread-9`, B @mentions there (own session), then A's plain message continues A's session and B's continues B's; a third user's plain message is ignored and their @mention starts a third session. "ending the second user's thread session …": after `endSession(B)` A still continues. "both users keep their own thread session across a restart (SQLite reload)". "another user talks in the thread while one has an open button ask; both work independently" (SESSION-MULTI-2): A's pending ask keeps its `askId` and `expiresAt`, B's session has none. All five tests fail with main's `src/discord/session-store.ts` + `src/discord/message-router.ts` swapped in (A's plain message: `ignore` / `no_mention`) and pass on the branch. |
| `REQ-discord-002` | `tests/discord.thread-sessions-per-user.test.ts`, `tests/discord.router.test.ts`, `tests/discord.session-store.durable.test.ts` | `getByThread(threadId, userId)` returns each user's own session in the thread; `getByThread(threadId)` the most recently active one; the existing DISCORD-2.a thread-continue and reload tests still pass. |
| `REQ-discord-201` | `tests/discord.actor-gate.test.ts` | A denied or unlisted member's plain message in a thread with another user's session is still refused silently (unchanged). |

## Automated coverage

- `bun test tests/discord.thread-sessions-per-user.test.ts tests/discord.router.test.ts tests/discord.actor-gate.test.ts tests/discord.forward-channel.test.ts tests/discord.session-store.durable.test.ts`
- Full suite: `bun test`; `bunx tsc --noEmit`; `fledge lanes run verify --non-interactive`.

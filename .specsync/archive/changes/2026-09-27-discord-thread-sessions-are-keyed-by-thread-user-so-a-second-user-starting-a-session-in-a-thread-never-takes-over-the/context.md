---
change: discord-thread-sessions-are-keyed-by-thread-user-so-a-second-user-starting-a-session-in-a-thread-never-takes-over-the
artifact: context
---

# Context

Captured HI (`hi/session.md`):

- **SESSION-MULTI-1** "Concurrent users in one channel each have their own
  session keyed by Discord user id (+ channel); no shared history across
  people."
- **SESSION-MULTI-2** "Other users can talk while one has an open button ask;
  both work independently; open buttons stay valid until press or timeout."

Also DISCORD-2.a (`hi/discord.md`): "Inside a thread it keeps one session for
that thread so the conversation stays coherent." That stays true per user.

Gap on main (fbaa84b): `SessionStore.byThreadId` was a single-valued
`Map<threadId, SessionStub>`, and the router's thread path continued a plain
message only when that one session was the author's. Repro with
`routeMessage` + `SessionStore`: A @mentions in thread t9 (start), A's plain
message continues, B @mentions in t9 (start; `create` overwrites
`byThreadId[t9]` with B's session), and A's next plain message in t9 returns
`{ kind: "ignore", reason: "no_mention" }`: silently dropped. After a restart
the last loaded row won the thread the same way, and ending B's session
deleted the thread entry so neither user's plain message continued.

Out of scope: the ask-button actor gate and mute/rate for presses (#232) and
the SAFE-3 clamp / busy-lock timeouts (#233). No schema change.

---
change: discord-thread-sessions-are-keyed-by-thread-user-so-a-second-user-starting-a-session-in-a-thread-never-takes-over-the
artifact: requirements
---

# Requirements

SESSION-MULTI-1 / SESSION-MULTI-2 (`hi/session.md`) and DISCORD-2.a
(`hi/discord.md`). Modified `REQ-discord-046` (thread plain messages continue
the author's own thread session; another user's session in the thread never
takes it over, with an open button ask, after the other session ends and after
a reload) and `REQ-discord-002` (the thread map keeps one session per thread
for each user). See `deltas/discord.md`. No new env vars, flags, slash
commands or schema changes.

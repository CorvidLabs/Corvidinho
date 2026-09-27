---
change: discord-thread-sessions-are-keyed-by-thread-user-so-a-second-user-starting-a-session-in-a-thread-never-takes-over-the
artifact: docs
---

# Docs

`docs/discord.md` "Session replies" gains one paragraph: in a thread each user
has their own session; a second user's @mention there starts theirs and never
takes over the first user's plain-message continuation (open ask buttons stay
theirs); someone with no session in the thread starts nothing without an
@mention. `specs/discord/discord.spec.md` notes the thread index keyed by
thread + user and `getByThread(threadId, userId?)`, and lists the new test
file; `specs/discord/testing.md` describes it. No README, CHANGELOG or STATUS
change; no operator knob.

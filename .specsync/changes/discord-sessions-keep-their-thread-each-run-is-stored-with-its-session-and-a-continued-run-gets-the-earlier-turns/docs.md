---
change: discord-sessions-keep-their-thread-each-run-is-stored-with-its-session-and-a-continued-run-gets-the-earlier-turns
artifact: docs
---

# Docs

`docs/discord.md` "Session replies" says a continued session carries its
earlier turns (bounded, labelled, opening request + newest kept), that they
survive a restart within the soft TTL and go with the session, stay per
user, are scrubbed, and that a spend-cap stop records no cap text.
`STATUS.md` gap line: Discord turn replay shipped; CLI resume (CLI-6) and
long-thread summarising (#72 drafts, not captured) remain.
`specs/discord/discord.spec.md`: files list (new source + two tests),
Public API (`session-thread.ts` exports, `SessionStore.recordTurn` /
`threadFor`), Invariants (turn replay line; module-owned tables sentence
names `discord_session_turns`). `specs/discord/testing.md` adds a section.
No README or CHANGELOG version section; no operator knob.

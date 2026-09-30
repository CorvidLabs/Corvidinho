---
change: req-discord-212-says-where-a-parent-deny-reaches-its-threads-a-deny-listed-thread-is-refused-on-every-path-while-a-deny
artifact: context
---

# Context

REQ-discord-212 (and the discord.spec.md prose that mirrors it) said that
when a thread **or its parent** is on `deny_channels`, the thread counts as
not allowlisted **on every path**. A read-only investigation of main
7697caf found that true for a deny on the thread, but not for a deny on the
parent alone: the paths that know a thread's parent (MessageCreate and the
restart row, `discord-send-file` and forget-card fallback of the run a
message in the thread starts or continues, and the ask buttons of a session
a message started in a thread and the runs they resume) refuse it through
`isMonitoredConversation`, while slash commands, `/schedule create`,
schedule ticks and `discord-post-message` gate only the id they are given
(`checkChannel` / `gateChannel`), and a `/session start` / `/work`
session records no thread id, so its own run and its ask-button picks
(asks, files, restart rows) judge the thread alone. A reply message in the
thread to such a session's answer is a message run and carries the parent. With `channels = [thread]` (or `[parent, thread]`) and
`deny_channels = [parent]`, those paths serve the thread.

No path posts in or runs from an id that is itself on `deny_channels`, so
the code meets HI as written: `hi/allow.md` ALLOW-3, `hi/discord.md`
DISCORD-5 and DISCORD-DENY-1..3, `hi/admin.md` ADMIN-3.c. None of them
says a deny on a parent is inherited by its threads. This change therefore
narrows the spec to the behaviour and pins it with tests; it changes no
code under `src/` or `plugins/` and captures no HI.

Constraints: spec-accuracy only (no behaviour change); no new `hi/`
criteria; the deny-wins-everywhere alternative is left for Leif.

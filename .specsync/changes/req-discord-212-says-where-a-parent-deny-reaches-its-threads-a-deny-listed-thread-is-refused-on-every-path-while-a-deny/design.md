---
change: req-discord-212-says-where-a-parent-deny-reaches-its-threads-a-deny-listed-thread-is-refused-on-every-path-while-a-deny
artifact: design
---

# Design

Decision: describe the behaviour as it is; change no gate.

- A thread on `deny_channels` stays refused on every path (unchanged
  wording, now also naming `discord-post-message`).
- A deny on the parent alone is stated to reach a thread allowlisted by its
  own id only where the bridge knows the parent: MessageCreate, and the ask
  buttons, restart rows, `discord-send-file` and forget-card fallback of a
  session a message started in a thread. Slash commands, `/schedule`
  create and ticks and `discord-post-message` gate the id they are given,
  and a `/session start` / `/work` session in a thread carries no parent,
  so those paths serve such a thread.
- REQ-discord-311 and REQ-discord-476 say the parent is recorded / passed
  only when a message started the session in a thread.
- Tests pin both halves so a later change to either is a visible,
  reviewed decision.

Security reading: no path posts in or runs from an id that is itself on
`deny_channels`; a thread listed by its own id is an explicit allow of that
thread. HI (ALLOW-3, DISCORD-5, DISCORD-DENY-1..3, ADMIN-3.c) does not say
a parent deny is inherited by its threads, so no HI criterion is broken and
none is invented.

Alternative left for Leif (not done here): "a parent deny wins on every
path". It needs a parent lookup for every slash interaction (the gateway
adapter passes none), a thread id on `/session start` / `/work`
sessions, a parent on their restart rows and send-file env, a parent for
`discord-post-message --channel` (a Discord API lookup), and a schedule
schema change to store a schedule channel's parent (or a lookup per tick).
That is a behaviour change with HI to capture first (PROCESS-1).

Risk: spec and docs only, plus tests; no code path, schema, env var or
command changes.

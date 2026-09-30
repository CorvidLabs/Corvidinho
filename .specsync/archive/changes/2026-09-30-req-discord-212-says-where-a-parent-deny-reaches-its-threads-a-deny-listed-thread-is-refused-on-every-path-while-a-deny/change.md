---
id: req-discord-212-says-where-a-parent-deny-reaches-its-threads-a-deny-listed-thread-is-refused-on-every-path-while-a-deny
state: archived
type: bug_fix
base_commit: 7697caf0f4ac4634c2cf2e1d3b848e11bd15c3b5
---

# REQ-discord-212 says where a parent deny reaches its threads: a deny-listed thread is refused on every path, while a deny on the parent alone refuses a thread allowlisted by its own id only where the bridge knows the parent (MessageCreate, and a message-started thread session's ask buttons, restart rows and discord-send-file); slash, schedule and discord-post-message gate the id they are given; tests pin both cases

## Intent

REQ-discord-212 says where a parent deny reaches its threads: a deny-listed thread is refused on every path, while a deny on the parent alone refuses a thread allowlisted by its own id only where the bridge knows the parent (MessageCreate, and a message-started thread session's ask buttons, restart rows and discord-send-file); slash, schedule and discord-post-message gate the id they are given; tests pin both cases

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- REQ-discord-212 (via the delta, with REQ-discord-311 and REQ-discord-476 where they overclaimed a parent) and the discord.spec.md prose say that a thread on deny_channels is refused on every path even under an allowlisted parent, and that a deny on the parent alone refuses a thread allowlisted by its own id only where the bridge knows the parent (MessageCreate, and the ask buttons, restart rows and discord-send-file of a session a message started in a thread), while slash commands, /schedule create and ticks, and discord-post-message gate the id they are given; the stale duplicate invariant lines in discord.spec.md are gone; tests/discord.thread-deny.test.ts pins channels=[thread] deny=[parent] (slash in the thread served, /schedule create and a tick on it served, discord-post-message --channel thread posts, an ask press for a /session start session in it resumes with no parent passed) and channels=[parent,thread] deny=[parent] (a message in the thread refused silently, slash served), keeps the channels=[parent] deny=[thread] refusals and adds discord-post-message there; no src/ change; specsync check, hi check, tsc, bun test and fledge verify green

## No-spec Rationale

Not applicable

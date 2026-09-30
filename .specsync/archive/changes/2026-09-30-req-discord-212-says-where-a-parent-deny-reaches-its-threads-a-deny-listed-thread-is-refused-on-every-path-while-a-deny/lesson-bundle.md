# Lesson bundle — req-discord-212-says-where-a-parent-deny-reaches-its-threads-a-deny-listed-thread-is-refused-on-every-path-while-a-deny

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: REQ-discord-212 says where a parent deny reaches its threads: a deny-listed thread is refused on every path, while a deny on the parent alone refuses a thread allowlisted by its own id only where the bridge knows the parent (MessageCreate, and a message-started thread session's ask buttons, restart rows and discord-send-file); slash, schedule and discord-post-message gate the id they are given; tests pin both cases
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: specs/discord/discord.spec.md, specs/discord/testing.md, docs/discord.md, tests/discord.thread-deny.test.ts
- **Acceptance**: REQ-discord-212 (via the delta, with REQ-discord-311 and REQ-discord-476 where they overclaimed a parent) and the discord.spec.md prose say that a thread on deny_channels is refused on every path even under an allowlisted parent, and that a deny on the parent alone refuses a thread allowlisted by its own id only where the bridge knows the parent (MessageCreate, and the ask buttons, restart rows and discord-send-file of a session a message started in a thread), while slash commands, /schedule create and ticks, and discord-post-message gate the id they are given; the stale duplicate invariant lines in discord.spec.md are gone; tests/discord.thread-deny.test.ts pins channels=[thread] deny=[parent] (slash in the thread served, /schedule create and a tick on it served, discord-post-message --channel thread posts, an ask press for a /session start session in it resumes with no parent passed) and channels=[parent,thread] deny=[parent] (a message in the thread refused silently, slash served), keeps the channels=[parent] deny=[thread] refusals and adds discord-post-message there; no src/ change; specsync check, hi check, tsc, bun test and fledge verify green

## Evidence

- Verification commit: `107598c05820046370d74c6a34306c7676c5c039`
- Base commit: `7697caf0f4ac4634c2cf2e1d3b848e11bd15c3b5`
- Verified by: `specsync check --spec discord`

## From the change's context.md

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

## From the change's design.md

# Design

Decision: describe the behaviour as it is; change no gate.

- A thread on `deny_channels` stays refused on every path (unchanged
  wording, now also naming `discord-post-message`).
- A deny on the parent alone is stated to reach a thread allowlisted by its
  own id only where the bridge knows the parent: MessageCreate and the
  restart row, `discord-send-file` and forget-card fallback of the run a
  message in the thread starts or continues, and the ask buttons of a
  session a message started in a thread and the runs they resume. Slash
  commands, `/schedule` create and ticks and `discord-post-message` gate
  the id they are given, and a `/session start` / `/work` session in a
  thread carries no parent on its own run or its ask-button picks, so those
  paths serve such a thread.
- REQ-discord-311 and REQ-discord-476 say the parent is recorded / passed
  for a message in a thread, and for a button pick only when a message
  started the session in a thread.
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

## From the change's testing.md

# Testing

Fixture tests only, in `tests/discord.thread-deny.test.ts` with its own
helpers: `routeMessage` / `componentChannelAllowlisted` directly,
`handleSlashInteraction` with an in-memory `SlashContext`,
`SchedulerService` (manual tick, no worktrees), `startBridge` with a null
gateway in dry run (including restart recovery over an in-memory DB), and
`runPlugin("discord-post-message")` in dry run with the env restored after.
No live Discord, no token, no network, no model.

Cases: A = `channels=[parent]`, `deny_channels=[thread]`; B =
`channels=[thread]`, `deny_channels=[parent]`; C =
`channels=[parent, thread]`, `deny_channels=[parent]`.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-212` | "parent and thread both listed, parent deny-listed: a message in the thread is refused silently (MessageCreate knows the parent)" | C: the @mention is `refuse` / `channel_not_allowlisted` with no reply, a plain message is ignored, no session. |
| `REQ-discord-212` | "through the bridge, a message in that thread runs no agent and posts nothing: a new @mention, and a talk started there before the parent was deny-listed (thread listed alone, or with the parent)" | B and C through `startBridge`: a new @mention runs nothing, sends or edits nothing and starts no session; a talk started with both ids listed and no deny, after the live allowlist moves to B or C, is not continued by a thread message, a reply to its bot message or a mention (the thread's own id is still listed, so only the parent deny stops it; the test fails with the deny removed). |
| `REQ-discord-212` | "an ask press for a session a message started in that thread gets no resume; one for a /session start session there (no thread id) is judged on the thread's own id" | B and C: `{channelId: parent, threadId: thread}` is false; `{channelId: thread}` is true; A: `{channelId: deny-listed thread}` is false. |
| `REQ-discord-212` | "through the bridge, a press for a session a message started in that thread, once the parent is deny-listed, gets only the zero-width ack: no resume, nothing posted, ask kept" | B and C through `startBridge` (live allowlist moved after the ask): the member's press gets only the zero-width ack, no second run, nothing sent or edited, the ask stays pending (fails with the deny removed). |
| `REQ-discord-212` | "a slash command in a thread allowlisted by its own id is served although its parent is deny-listed (slash gates the id it is given)" | B and C: `/status` in the thread returns ok with its answer, not the zero-width ack or the tip. |
| `REQ-discord-212` | "/schedule create naming that thread as its channel is accepted, and its tick runs and posts in the thread (schedule gates the id it is given)" | B and C: "Schedule created" with the thread as channel; a due schedule on the thread runs once, posts to the thread, finishes ok. |
| `REQ-discord-212` / `REQ-discord-476` | "an ask press for a /session start session in that thread resumes it there, with no parent passed to the run (so discord-send-file and a restart row judge the thread alone)" | B and C through `startBridge`: `/session start` in the thread records `channelId` = thread, no `threadId`; the pick resumes the same session (second run) with `replyChannelId` = thread and no `replyParentChannelId`. |
| `REQ-discord-212` / `REQ-discord-311` / `REQ-discord-476` | "a reply in the thread to a /session start session's answer is a message run: it passes the thread's parent and records it on its restart row, while the session's pick passes and records none" | `startBridge` over an in-memory DB with both ids listed: the pick run gets no `replyParentChannelId` and its open restart row is `{channelId: thread, parentChannelId: null}`; the reply to the session's tracked answer continues the same session with `replyParentChannelId` = parent and a restart row `{channelId: thread, parentChannelId: parent}`. |
| `REQ-discord-212` | "discord-post-message gates the id it is given": "a deny-listed thread under an allowlisted parent is refused (is denied), nothing posted" and "a thread allowlisted by its own id posts although its parent is deny-listed (dry run)" | A: exit 3, `"thread-denied" is denied`. B and C: ok, dry run, `channelId` = thread. |
| `REQ-discord-311` | "a button-pick row of a /session start session in a thread allowlisted by its own id records no parent, so a deny on the parent alone does not stop its recovery" | B env, row `{channelId: thread, parentChannelId: null}`: the progress embed in the thread is edited to interrupted and the row deleted. |
| `REQ-discord-212` / `REQ-discord-311` | existing A tests (router, `componentChannelAllowlisted`, bridge mention / talk / ask press, slash, `/schedule create`, tick, restart rows) | Unchanged and green; the tick test now uses the shared `tickSchedule` helper. |

These tests pin current behaviour, so they pass on main 7697caf as well as
on the branch; this is a spec-accuracy change with no code change, so there
is no fail-on-base case.

Run: `bun test tests/discord.thread-deny.test.ts` (29 pass: the 18 kept plus 11 new); full
`bun test`, `bunx tsc --noEmit`, `specsync check --require-coverage 100`,
`hi check` and `fledge lanes run verify --non-interactive` green.

## Where these lessons go

- `specs/discord/context.md`

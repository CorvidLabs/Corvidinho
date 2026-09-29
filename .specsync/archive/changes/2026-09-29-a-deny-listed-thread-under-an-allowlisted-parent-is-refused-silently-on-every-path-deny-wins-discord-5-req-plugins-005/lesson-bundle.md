# Lesson bundle — a-deny-listed-thread-under-an-allowlisted-parent-is-refused-silently-on-every-path-deny-wins-discord-5-req-plugins-005

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: A deny-listed thread under an allowlisted parent is refused silently on every path: deny wins (DISCORD-5, REQ-plugins-005)
- **Kind**: BugFix
- **Specs**: discord, plugins
- **Paths**: src/allowlist/discord.ts, src/discord/permissions.ts, src/discord/message-router.ts, src/discord/bridge.ts, plugins/discord/send-file.ts, tests/discord.thread-deny.test.ts, tests/discord.send-file.test.ts, tests/allowlist.default-deny.test.ts, specs/discord/discord.spec.md, specs/discord/testing.md, specs/plugins/plugins.spec.md, specs/plugins/testing.md, docs/discord.md
- **Acceptance**: With [discord].channels = [parent] and deny_channels = [thread], a message in that thread (an @mention, a plain thread continuation of an existing session, or a reply to a tracked bot message) is refused silently: routeMessage returns ignore / refuse with no reply, no session is started or continued, the agent is not run and nothing is posted, edited or deleted; componentChannelAllowlisted is false for a press in the thread and for any session whose thread or channel is deny-listed, so an ask button there gets only the ephemeral zero-width ack (the allowlist tip for an admin) and does not resume; a slash command in the thread gets only the ephemeral zero-width ack (tip for an admin); /schedule create with that thread as its channel is refused and a schedule whose channel is the thread neither runs nor posts at tick; restart recovery edits and replies nothing in a deny-listed thread (or under a deny-listed parent) and deletes its row; discord-send-file refuses a deny-listed thread even under an allowlisted parent and uploads nothing; a deny on the parent also wins over an allowlisted thread; isChannelDenied reports a deny_channels hit case-insensitively like checkChannel; an allowlisted parent without a deny still serves its threads (DISCORD-2.a); regression tests fail on the base and pass on the branch.

## Evidence

- Verification commit: `685c71c8f70db72cb0e4f992ecb86712c31eba8b`
- Base commit: `0f2e2c2774635d1dcbdff599cba92dbecf8eebd9`
- Verified by: `specsync check --spec discord --spec plugins`

## From the change's context.md

# Context

W12 bug sweep (Leif's 2026-09-28 interview, Wave 0: "W12 bug sweep (2
confirmed seeds)"), verified defect `thread-deny-listed-still-served`
(severity major, security cross-cut). No new hi criteria: the fix enforces
already-captured ones. REQ-plugins-005: "Allowlists SHALL default-deny: …
Discord channel/role/user checks (ALLOW-1..5, GITHUB-6, DISCORD-5). Deny
overrides always win."; DISCORD-5: "It only listens and posts in channels I
allowlisted."; ALLOW-3; ADMIN-3.c ("As owner I can change deny lists").
REQ-discord-212 accepts "the thread's parent channel … or the thread itself",
but with REQ-plugins-005 an explicit deny on the thread has to win over its
allowed parent.

Before (origin/main 310861f; re-checked on 0f2e2c2 after #233 landed): with `channels = [parent-1]` and
`deny_channels = [thread-denied]`, `checkChannel("thread-denied")` refused
the thread, but `routeMessage` started a session for the owner's @mention in
it (the parent passed first), `componentChannelAllowlisted` accepted a press
there, restart recovery's `mayPost` ORed in the parent, and
`discord-send-file` gated only the parent. End to end the agent ran once and
the answer was posted in the denied thread. Slash (`gateChannel` on the
thread id) and `discord-post-message` (`checkChannel` on the channel given)
already refused the thread, so the gates disagreed.

Interview design calls for this slice: minimal fix per the record; deny
always wins over an allowlisted parent on chat, thread, slash, button and
schedule paths; silent refusal per DISCORD-DENY rules; fail-on-main tests;
kind bug-fix. Constraints kept: #232 / #233 scope untouched (#232 added the
actor and mute/rate gates to presses, not channel deny); v1 off-chain; no new
slash command, env var, config key, table or schema bump; `specs/` only
through SpecSync.

## From the change's design.md

# Design

- `src/allowlist/discord.ts`: `isChannelDenied(id, cfg)` — the deny half of
  `checkChannel` (trimmed, case-insensitive), which `checkChannel` now calls,
  so there is one deny match.
- `src/discord/permissions.ts`: `isMonitoredConversation(channelId,
  parentChannelId, cfg)` — false when either id is deny-listed, else true
  when either is allowlisted (`isMonitoredChannel`). Plain channels pass no
  parent and behave exactly as `isMonitoredChannel`.
- `src/discord/message-router.ts`: `ownChannelAllowlisted` uses
  `isMonitoredConversation(threadId, channelId)` in a thread (plain channel
  unchanged); `componentChannelAllowlisted` checks the session's own channel
  the same way. The press channel check is unchanged: `isMonitoredChannel`
  already refuses a deny-listed press channel, and the thread-under-parent
  clause can only match the session's thread, which the session check has
  already refused when denied.
- `src/discord/bridge.ts`: restart-recovery `mayPost` =
  `isMonitoredConversation(row.channelId, row.parentChannelId)`.
- `plugins/discord/send-file.ts`: when the conversation channel itself is
  deny-listed, gate on it (`checkChannel` → "is denied") instead of the
  parent; otherwise unchanged (`parent || channel`).
- Slash (`gateChannel(interaction.channelId)`), `/schedule create`
  (`checkChannel(channel)`), the scheduler tick (`checkChannel(schedule
  .channelId)`) and `discord-post-message` (`checkChannel(channel)`) already
  gate the thread id itself, so deny already won there; they are unchanged and
  covered by regression-lock tests.
- Refusal shapes are the existing ones (silent `refuse` / `ignore` on
  MessageCreate, zero-width ack or admin tip on interactions, the
  `checkChannel` error for the plugin, skipped recovery row). No new surface.
- Trade-off: a deny on the parent also wins over an explicitly allowlisted
  thread (the record's fix checks deny on both ids). Conservative; listed as a
  design choice pending Leif.

## From the change's testing.md

# Testing

Fixtures only: fake gateway through `startBridge` (dry run), in-memory
`SessionStore` / `ScheduleStore` / SQLite, `handleSlashInteraction` with a
memory interaction, `SchedulerService` in manual mode, stubbed `fetch` and
requester checker for `discord-send-file`. No live Discord or network.

Fail-on-base proof (base sources `0f2e2c2` swapped in for the five changed
source files, tests from the branch, then restored):

- `tests/discord.thread-deny.test.ts`: 10 fail, 8 pass on the base (the 8 are
  the slash / `/schedule create` / tick locks, which already gated the thread
  id, and the "parent and its other threads still served" contrasts);
  18 pass on the branch.
- `tests/discord.send-file.test.ts` deny case: fails on the base (the upload
  went out), passes on the branch.
- `tests/allowlist.default-deny.test.ts`: fails to load on the base
  (`isChannelDenied` is not exported); 10 pass on the branch.
- Branch: all Discord, scheduler and allowlist suites green (742 tests);
  full `bun test`, `bunx tsc --noEmit` and
  `fledge lanes run verify --non-interactive` green.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-212` | `tests/discord.thread-deny.test.ts` › "router: a deny-listed thread under an allowlisted parent is refused silently" | @mention refused `channel_not_allowlisted` with no reply, plain message ignored, no session; a session started before the deny is not continued by thread message, reply-to-bot or mention; parent deny wins over an allowlisted thread; parent and other threads still start sessions. |
| `REQ-discord-212` | `tests/discord.thread-deny.test.ts` › "componentChannelAllowlisted: deny wins over an allowlisted parent" | False for a press in the denied thread, for its session pressed from the parent, with no session, and for a session under a denied parent; true for another thread under the parent. |
| `REQ-discord-212` | `tests/discord.thread-deny.test.ts` › "bridge: a deny-listed thread under an allowlisted parent" and "bridge: an ask button in a deny-listed thread does not resume" | Owner @mention: no agent run, nothing posted, no session; a talk stops once its thread is denied (nothing new posted); a press gets only the zero-width ack (tip for an admin), no resume, ask still pending. |
| `REQ-discord-212` | `tests/discord.thread-deny.test.ts` › "slash and schedule: the thread id itself is gated" | Slash in the denied thread: zero-width ack for a member, tip for the owner, no session; `/schedule create` naming it refused, nothing scheduled; a schedule on it neither runs nor posts (`channel not allowlisted: thread-denied`). |
| `REQ-discord-311` | `tests/discord.thread-deny.test.ts` › "restart recovery posts nothing in a deny-listed thread" | Row in the denied thread under the allowlisted parent, and row in an allowlisted thread under a denied parent: no edit, no reply, row deleted; a row in another thread under the parent is still edited there. |
| `REQ-discord-476` | `tests/discord.send-file.test.ts` › "a deny-listed thread is refused even under its allowlisted parent" | Refused `"…" is denied`, no requester check, no upload; another thread under the parent still attaches. |
| `REQ-plugins-005` | `tests/allowlist.default-deny.test.ts` › "isChannelDenied" | True for the denied id in any case with spaces trimmed (config and `DiscordAllowlists`); false for allowlisted, unlisted, empty, undefined and null ids; `checkChannel` says "is denied". |

## Where these lessons go

- `specs/discord/context.md`
- `specs/plugins/context.md`

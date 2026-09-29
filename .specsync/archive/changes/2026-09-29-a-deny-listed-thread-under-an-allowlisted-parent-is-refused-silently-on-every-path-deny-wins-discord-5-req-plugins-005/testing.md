---
change: a-deny-listed-thread-under-an-allowlisted-parent-is-refused-silently-on-every-path-deny-wins-discord-5-req-plugins-005
artifact: testing
---

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

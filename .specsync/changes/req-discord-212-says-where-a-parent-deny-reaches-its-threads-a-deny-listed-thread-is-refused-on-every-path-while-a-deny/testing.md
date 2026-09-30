---
change: req-discord-212-says-where-a-parent-deny-reaches-its-threads-a-deny-listed-thread-is-refused-on-every-path-while-a-deny
artifact: testing
---

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
| `REQ-discord-212` | "through the bridge, an @mention in that thread runs no agent and posts nothing (thread listed alone, or with the parent)" | B and C through `startBridge`: no agent run, nothing sent or edited, no session. |
| `REQ-discord-212` | "an ask press for a session a message started in that thread gets no resume; one for a /session start session there (no thread id) is judged on the thread's own id" | B and C: `{channelId: parent, threadId: thread}` is false; `{channelId: thread}` is true; A: `{channelId: deny-listed thread}` is false. |
| `REQ-discord-212` | "a slash command in a thread allowlisted by its own id is served although its parent is deny-listed (slash gates the id it is given)" | B and C: `/status` in the thread returns ok with its answer, not the zero-width ack or the tip. |
| `REQ-discord-212` | "/schedule create naming that thread as its channel is accepted, and its tick runs and posts in the thread (schedule gates the id it is given)" | B: "Schedule created" with the thread as channel; a due schedule on the thread runs once, posts to the thread, finishes ok. |
| `REQ-discord-212` / `REQ-discord-476` | "an ask press for a /session start session in that thread resumes it there, with no parent passed to the run (so discord-send-file and a restart row judge the thread alone)" | B and C through `startBridge`: `/session start` in the thread records `channelId` = thread, no `threadId`; the pick resumes the same session (second run) with `replyChannelId` = thread and no `replyParentChannelId`. |
| `REQ-discord-212` | "discord-post-message gates the id it is given": "a deny-listed thread under an allowlisted parent is refused (is denied), nothing posted" and "a thread allowlisted by its own id posts although its parent is deny-listed (dry run)" | A: exit 3, `"thread-denied" is denied`. B and C: ok, dry run, `channelId` = thread. |
| `REQ-discord-311` | "a button-pick row of a /session start session in a thread allowlisted by its own id records no parent, so a deny on the parent alone does not stop its recovery" | B env, row `{channelId: thread, parentChannelId: null}`: the progress embed in the thread is edited to interrupted and the row deleted. |
| `REQ-discord-212` / `REQ-discord-311` | existing A tests (router, `componentChannelAllowlisted`, bridge mention / talk / ask press, slash, `/schedule create`, tick, restart rows) | Unchanged and green; the tick test now uses the shared `tickSchedule` helper. |

These tests pin current behaviour, so they pass on main 7697caf as well as
on the branch; this is a spec-accuracy change with no code change, so there
is no fail-on-base case.

Run: `bun test tests/discord.thread-deny.test.ts` (27 pass: the 18 kept plus 9 new); full
`bun test`, `bunx tsc --noEmit`, `specsync check --require-coverage 100`,
`hi check` and `fledge lanes run verify --non-interactive` green.

---
change: req-discord-212-says-where-a-parent-deny-reaches-its-threads-a-deny-listed-thread-is-refused-on-every-path-while-a-deny
artifact: research
---

# Research

Gates (main 7697caf):

- `checkChannel` (`src/allowlist/discord.ts`): deny first, then the
  allowlist, on the one id it is given. `isMonitoredChannel` and
  `gateChannel` (`src/discord/permissions.ts`) wrap it.
- `isMonitoredConversation(ch, parent)`: false when `ch` or `parent`
  is deny-listed, else true when either is allowlisted.

Path × case (T = thread, P = parent; A: channels=[P] deny=[T];
B: channels=[T] deny=[P]; C: channels=[P,T] deny=[P]):

| Path | Gate | A | B | C |
|---|---|---|---|---|
| MessageCreate (@mention, thread continuation, reply-to-bot) in T | `ownChannelAllowlisted` → `isMonitoredConversation(T, P)` | refused | refused | refused |
| Ask press, session a message started in T (`{channelId: P, threadId: T}`) | `componentChannelAllowlisted` → `isMonitoredConversation` | ack only | ack only | ack only |
| Ask press, `/session start` / `/work` session in T (`{channelId: T}`) | `componentChannelAllowlisted` → `isMonitoredChannel(T)` | ack only | resumes | resumes |
| Slash command in T (channel autocomplete likewise) | `gateChannel(interaction.channelId)` | ack / tip (autocomplete: no choices) | served | served |
| `/schedule create channel:T` | `checkChannel(T)` | refused | created | created |
| Schedule tick on T | `gateTick` → `checkChannel(T)` | refused | runs, posts in T | runs, posts in T |
| Restart row of a message-started run | `isMonitoredConversation(row.channelId, row.parentChannelId)` | nothing | nothing | nothing |
| Restart row of a pick for a `/session start` session in T (parent null) | same, parent null | nothing | recovered | recovered |
| `discord-send-file`, message-started run (parent env set) | `isMonitoredConversation` | refused | refused | refused |
| `discord-send-file`, `/session start` / `/work` run or its pick (parent '') | same, parent '' | refused | allowed | allowed |
| `discord-post-message --channel T` | `checkChannel(T)` | refused | posts | posts |

Where the parent is recorded: `bridge.ts` message path
(`parentChannelId: msg.threadId ? msg.channelId : null`,
`replyParentChannelId` only when `msg.threadId`); button pick
(`session.threadId ? session.channelId : null`); `session.ts` /
`work.ts` create the session with `channelId: interaction.channelId`
and no thread id and pass only `replyChannelId`; `adaptChatInput`
passes no parent for a slash interaction. A reply message in a thread to a
`/session start` session's tracked answer continues that session as a
message run, so it passes and records the parent (`msg.threadId` is set).
A new @mention also passes `gateInbound` on the message's channel (the
parent, for a thread), so with `channels = [thread]` alone a new @mention
in the thread is refused even without a deny, while a talk already in the
thread continues on the thread's own id; the bridge tests for B therefore
start the talk with both ids listed and then move the live allowlist.

Spec text that overclaimed: REQ-discord-212 ("when a thread or its parent
channel is on `deny_channels` … on every path"; AC "A thread under a
deny-listed parent is refused even when the thread itself is allowlisted";
the `isMonitoredConversation` caller list without `discord-send-file`
and the forget-card fallback); REQ-discord-311 ("the allowlisted parent
channel id when the reply is in a thread"; a slash-started pick records
none); REQ-discord-476 ("ask-button runs … (the thread, with its parent, in
a thread)" and "An ask-button run in a thread SHALL carry … its parent");
discord.spec.md Public API caller list, the `discord-send-file`
invariant, the MessageCreate invariant's parenthetical, two Error Cases
rows; docs/discord.md "Deny always wins". Three invariant lines in
discord.spec.md were older copies of fuller lines next to them
(`/schedule` without the cadence detail, memories without MEMORY-5..9,
in-flight rows without "and neither is deny-listed").

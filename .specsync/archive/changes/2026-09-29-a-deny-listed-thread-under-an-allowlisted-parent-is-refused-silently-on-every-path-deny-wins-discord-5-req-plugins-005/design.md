---
change: a-deny-listed-thread-under-an-allowlisted-parent-is-refused-silently-on-every-path-deny-wins-discord-5-req-plugins-005
artifact: design
---

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

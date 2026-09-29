---
change: a-deny-listed-thread-under-an-allowlisted-parent-is-refused-silently-on-every-path-deny-wins-discord-5-req-plugins-005
artifact: research
---

# Research

- Every Discord channel gate was listed (`grep` for `checkChannel`,
  `isMonitoredChannel`, `gateChannel`, `denyChannels`, `parentChannelId`):
  router own-channel gate, press gate, restart recovery `mayPost` and
  `discord-send-file` consulted the parent and let it outvote a deny on the
  thread; slash, `/schedule create`, the scheduler tick, `/admin` and
  `discord-post-message` gate the given id directly (deny first).
- The gateway sets `InboundMessage.channelId` to the thread's parent and
  `threadId` to the thread; in-flight rows store the thread as `channelId`
  and the parent as `parentChannelId`; sessions store the parent as
  `channelId` and the thread as `threadId`; slash and button interactions
  carry the thread as `channelId`.
- `deny_channels` is lower-cased at load (file and
  `CORVIDINHO_DISCORD_DENY_CHANNELS`) and `checkChannel` also lower-cases, so
  `isChannelDenied` keeps that match.
- The live allowlist is read per event (the bridge shares the object `/admin`
  edits), so a deny added mid-talk applies to the next message or press.

---
change: a-deny-listed-thread-under-an-allowlisted-parent-is-refused-silently-on-every-path-deny-wins-discord-5-req-plugins-005
artifact: requirements
---

# Requirements

No new criteria captured (the W12 record names only captured ones):

- **REQ-plugins-005** / **ALLOW-3**: deny overrides always win → a thread on
  `deny_channels` is refused even when its parent is allowlisted, and a deny
  on the parent wins over an allowlisted thread.
- **DISCORD-5**: listens and posts only in allowlisted channels → no session,
  run, post, edit or upload in a deny-listed thread on any path.
- **DISCORD-DENY-1..3**: MessageCreate refusal is silent; an interaction gets
  only the ephemeral zero-width ack (the allowlist tip for an admin).
- **DISCORD-2.a**: the allowlisted parent's other threads keep working.
- **ADMIN-3.c**: a deny the owner sets takes effect (the live allowlist is
  read per event, so a thread denied mid-talk stops at the next message).

Canonical requirements (see deltas, all Modified — full text plus the new
paragraph and bullets):

- **REQ-discord-212**: deny wins over an allowlisted parent on MessageCreate,
  ask buttons, slash, schedules, restart recovery and `discord-send-file`;
  `isMonitoredConversation` is the shared thread-or-parent check.
- **REQ-discord-311**: restart recovery treats a row in a deny-listed thread
  (or under a deny-listed parent) as not allowlisted.
- **REQ-discord-476**: `discord-send-file` refuses a deny-listed thread even
  under an allowlisted parent.
- **REQ-plugins-005**: `isChannelDenied` reports a `deny_channels` hit alone.

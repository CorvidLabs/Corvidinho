---
change: schedule-ask-outbox-delivery-re-checks-the-creator-and-channel-against-the-live-discord-schedule-3-gate
artifact: context
---

# Context

Captured HI (`hi/discord.md`): **DISCORD-SCHEDULE-3** "Schedule ticks respect
existing channel/user allowlists and SAFE gates; a schedule cannot post or act
outside channels/repos I already allow." Also AUTONOMY-2 / AUTONOMOUS-7 (the
needs-human outbox this PR adds, REQ-discord-347).

Found while merging origin/main (#236, `gateTick`) into this branch: the
in-process post now goes through `gateTick` (creator + channel), but the
new delivery pass for daemon-claimed asks (`deliverPendingAsks`) still
checked only the channel. Repro: a daemon stuck run for a schedule whose
creator is then removed from a non-empty user list (or deny-listed) is still
posted by the bridge's next tick, pinging as that schedule, while a live
message from that creator, and a bridge-run post of the same schedule, are
refused.

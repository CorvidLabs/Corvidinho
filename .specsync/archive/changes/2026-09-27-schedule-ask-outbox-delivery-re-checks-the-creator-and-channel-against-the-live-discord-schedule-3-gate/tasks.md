---
change: schedule-ask-outbox-delivery-re-checks-the-creator-and-channel-against-the-live-discord-schedule-3-gate
artifact: tasks
---

# Tasks

- [x] Repro on the merged branch: a pending ask of a schedule whose creator the live allowlist refuses is posted.
- [x] Regression test in `tests/scheduler.ask-outbox.test.ts` that fails with the channel-only check.
- [x] `deliverPendingAsks` skips a schedule `gateTick` refuses; the ask stays pending and posts once the creator is allowed again.
- [x] Delta: Modified REQ-discord-347 (delivery and in-process post name the live creator + channel gate; new acceptance bullet).
- [x] Spec invariant (`discord.spec.md`) and module testing notes updated.

---
change: bridge-marks-a-reply-interrupted-after-a-restart-in-flight-replies-are-recorded-in-the-shared-db-and-the-next-bridge
artifact: tasks
---

# Tasks

- [x] Regression tests that fail before the fix.
- [x] Schema v9 `discord_inflight_replies` + v8→v9 migration test.
- [x] `InflightReplyStore` and `recoverInterruptedReplies` (sequential, best effort, never throws).
- [x] Bridge records the row per reply and clears it on every exit path.
- [x] Bridge start recovers leftover rows after the gateway is up.
- [x] Delta REQ-discord-311 and discord spec files / Public API / invariants / error cases.

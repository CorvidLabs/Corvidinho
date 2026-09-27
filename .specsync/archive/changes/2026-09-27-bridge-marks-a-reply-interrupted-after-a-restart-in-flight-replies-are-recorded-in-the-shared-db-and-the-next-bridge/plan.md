---
change: bridge-marks-a-reply-interrupted-after-a-restart-in-flight-replies-are-recorded-in-the-shared-db-and-the-next-bridge
artifact: plan
---

# Plan

1. Regression tests `tests/discord.inflight-replies.test.ts` (fail on main).
2. Schema v9 table in `src/store/db.ts`; bump the pinned version test.
3. `src/discord/inflight-replies.ts` store + recovery.
4. Wire `bridge.ts`: row lifecycle in `onMessage`, snapshot at start,
   recovery after `gateway.start()`.
5. Delta REQ-discord-311, spec files / API / invariants / errors, SpecSync
   check, verify lane.

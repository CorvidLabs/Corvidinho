---
change: schedule-ask-outbox-delivery-re-checks-the-creator-and-channel-against-the-live-discord-schedule-3-gate
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-347` | `tests/scheduler.ask-outbox.test.ts` | "a creator the live allowlist no longer lists gets no post; the ask stays pending until they are back (DISCORD-SCHEDULE-3)": with the bridge's user list `["someone-else"]`, then the creator listed but deny-listed, the daemon's stuck ask is not posted and `ask_posted_at` stays null; clearing the deny list in place posts it once with the owner ping. Fails with the channel-only check in `deliverPendingAsks` (1 post on the first tick) and passes with `gateTick`. The other 17 outbox tests still pass. |
| `REQ-discord-020` | `tests/scheduler.actor-gate.test.ts`, `tests/daemon.test.ts` | The tick gate tests from #236 still pass on the merged branch. |

Full suite: `bun test` green; `bunx tsc --noEmit` clean; `fledge lanes run verify --non-interactive` green.

---
change: bridge-marks-a-reply-interrupted-after-a-restart-in-flight-replies-are-recorded-in-the-shared-db-and-the-next-bridge
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-311` | `tests/discord.inflight-replies.test.ts` | 16 tests: schema v9 table + v8→v9 migration keeps rows; store lifecycle across a DB reopen; row present with the progress embed id during the run and cleared after success, failed exit, ask, thrown error and worktree refusal; ignored messages record nothing; crash simulation (bridge A hangs mid-reply, bridge B starts on the same DB) edits A's embed to the red interrupted status and deletes the row; failed edit → reply to the request message; no embed id → reply; edit and reply both throw → start succeeds, row deleted; no rows → no send/edit/reply; recovery is sequential (max 1 Discord call at a time). 0/16 pass on main (module and table missing), 16/16 after. |
| `REQ-discord-311` | `tests/watch.session-store.durable.test.ts` | `SCHEMA_VERSION` pinned to 9 and a fresh DB reports it. |
| `REQ-discord-311` | `tests/discord.ask-ping.test.ts` | The v7→v8 `pending_ask` migration test now expects the latest version (v8+) instead of exactly 8, so it still proves the v8 column with v9 on top. |

Also run: `bunx tsc --noEmit`, full `bun test`,
`specsync check --require-coverage 100`,
`fledge lanes run verify --non-interactive`.

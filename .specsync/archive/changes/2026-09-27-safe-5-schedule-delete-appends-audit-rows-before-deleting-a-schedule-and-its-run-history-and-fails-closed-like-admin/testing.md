---
change: safe-5-schedule-delete-appends-audit-rows-before-deleting-a-schedule-and-its-run-history-and-fails-closed-like-admin
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-020` | `tests/discord.schedule.test.ts` | "/schedule delete audit (SAFE-5)": the owner's delete of a DB-backed schedule with one run appends `schedule-delete` `started` then `ok` (surface `discord:schedule`, digest of the resolved id, raw id absent), replies `Audit: #1 started · #2 ok`, removes the schedule and its run rows, and `verifyAudit` is ok; a throwing trail, a keyed chain without the key, and no trail wired each reply `audit log unavailable (SAFE-5)` and keep the schedule and its run; a non-ADMIN delete gets `not authorized` and appends `denied` (a refused pause appends nothing); a store delete that throws after the intent row appends `error`; an unknown id appends nothing; an `ok` row that cannot be written after the delete leaves the delete in place and the reply says `ok row not recorded (see bridge log)`; a non-ADMIN delete while the trail throws still gets only `not authorized` and deletes nothing (guard: passes on main too). 7 of these fail on main's `schedule.ts` (no rows, delete not refused) and all pass on the branch. |
| `REQ-discord-020` | `tests/discord.schedule.test.ts` | "admin create + list + pause + resume + delete" (now with `recordAudit` wired) and the other `/schedule` dispatch tests still pass. |
| `REQ-discord-043` | `tests/discord.admin-slash.test.ts` | `/admin` audit and fail-closed tests unchanged and still pass. |

Full suite: `bun test` green; `bunx tsc --noEmit` clean; `fledge lanes run verify --non-interactive` green.

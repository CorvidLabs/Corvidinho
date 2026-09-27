# Lesson bundle — safe-5-schedule-delete-appends-audit-rows-before-deleting-a-schedule-and-its-run-history-and-fails-closed-like-admin

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: SAFE-5: /schedule delete appends audit rows before deleting a schedule and its run history, and fails closed like /admin when the audit trail is unavailable
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: src/discord/command-handlers/schedule.ts, tests/discord.schedule.test.ts, specs/discord/requirements.md, specs/discord/discord.spec.md, specs/discord/testing.md, docs/discord.md, docs/DISCORD-GO-LIVE.md
- **Acceptance**: /schedule delete by the owner appends SAFE-5 started then ok rows (action schedule-delete, surface discord:schedule, args digest only) before the schedule and its run history are deleted, and the reply names the row numbers; when the audit trail throws, the chain is keyed and the process has no key, or no trail is wired, it replies 'audit log unavailable (SAFE-5)' and deletes nothing; a non-ADMIN delete gets 'not authorized' and appends denied; a delete that throws after the intent row appends error; tests/discord.schedule.test.ts covers each and fails on main

## Evidence

- Verification commit: `5af50948696d1b685f1eaa429152b56565067ccc`
- Base commit: `fbaa84b7cda1bf2b462baea44cad20ef93e0df4f`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Scoping record w10 rank 6 (SAFE-5). On main (fbaa84b)
`handleDelete` in `src/discord/command-handlers/schedule.ts` called
`ctx.scheduleStore.delete`, which deletes the schedule's `schedule_runs` rows
and its `schedules` row (`src/scheduler/store.ts`), and wrote nothing to the
SAFE-5 audit chain. `grep -i audit src/discord/command-handlers/` found only
`admin.ts` and `status.ts`. `/admin` already records its mutations (intent
first, fail closed when the trail is unavailable, REQ-discord-043).

Repro on main: a DB-backed `ScheduleStore` with one schedule and one run, the
owner runs `/schedule delete schedule:<id>` with `recordAudit` wired to that DB:
the schedule and its run are gone and `audit_log` has 0 rows. With
`recordAudit` throwing, or unset, the delete still goes through.

Captured HI (`hi/safe.md`): "SAFE-5 Destructive actions leave a
tamper-evident audit trail I can verify later."

Constraints: smallest slice; no new env var, config key, slash command,
option or schema change (the chain table already exists, schema v5); no
package bump or CHANGELOG version section. Open PRs #232 (ask-button actor
gate + mute/rate) and #233 (SAFE-3 clamp) are out of scope and untouched.
No open issue tracks SAFE-5 (#95, which shipped the chain, is closed).

## From the change's design.md

# Design

- Reuse the `/admin` pattern and the existing `SlashContext.recordAudit` (the
  bridge already wires it to `appendAudit` on the shared DB with
  `CORVIDINHO_AUDIT_HMAC_KEY`): no new context field, env var or schema.
- `handleDelete`: after the id resolves, append `started` (action
  `schedule-delete`, surface `discord:schedule`, actor = invoker id,
  `argsDigest(["delete", <resolved id>])`). If that throws or `recordAudit` is
  unset, reply `Refused: audit log unavailable (SAFE-5): <reason>. Nothing
  changed.` and return without deleting. Then delete; a throw (or `false`)
  appends `error` best effort and replies with the error; success appends `ok`
  best effort and the reply names `#<started> started · #<ok> ok` (or says the
  ok row was not recorded, as `/admin` does).
- A non-ADMIN `/schedule delete` appends `denied` best effort before the
  `not authorized` reply, as `/admin`'s handler re-check does.
- Missing or unknown ids delete nothing and append nothing (no destructive
  action was attempted).
- Design choice pending Leif: only `delete` is audited. `create`, `pause` and
  `resume` do not destroy data (pause/resume are reversible and create adds a
  row), so they stay unaudited; SAFE-5 names destructive actions only.
- Design choice pending Leif: a bridge without an audit trail (no DB; in
  practice only test harnesses that inject stores) refuses `/schedule delete`
  rather than deleting unaudited, matching `/admin` (REQ-discord-043).
- The small `auditSoft` helper is repeated in `schedule.ts` rather than moved
  out of `admin.ts`, so `/admin` is untouched by this slice.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-020` | `tests/discord.schedule.test.ts` | "/schedule delete audit (SAFE-5)": the owner's delete of a DB-backed schedule with one run appends `schedule-delete` `started` then `ok` (surface `discord:schedule`, digest of the resolved id, raw id absent), replies `Audit: #1 started · #2 ok`, removes the schedule and its run rows, and `verifyAudit` is ok; a throwing trail, a keyed chain without the key, and no trail wired each reply `audit log unavailable (SAFE-5)` and keep the schedule and its run; a non-ADMIN delete gets `not authorized` and appends `denied` (a refused pause appends nothing); a store delete that throws after the intent row appends `error`; an unknown id appends nothing; an `ok` row that cannot be written after the delete leaves the delete in place and the reply says `ok row not recorded (see bridge log)`; a non-ADMIN delete while the trail throws still gets only `not authorized` and deletes nothing (guard: passes on main too). 7 of these fail on main's `schedule.ts` (no rows, delete not refused) and all pass on the branch. |
| `REQ-discord-020` | `tests/discord.schedule.test.ts` | "admin create + list + pause + resume + delete" (now with `recordAudit` wired) and the other `/schedule` dispatch tests still pass. |
| `REQ-discord-043` | `tests/discord.admin-slash.test.ts` | `/admin` audit and fail-closed tests unchanged and still pass. |

Full suite: `bun test` green; `bunx tsc --noEmit` clean; `fledge lanes run verify --non-interactive` green.

## Where these lessons go

- `specs/discord/context.md`

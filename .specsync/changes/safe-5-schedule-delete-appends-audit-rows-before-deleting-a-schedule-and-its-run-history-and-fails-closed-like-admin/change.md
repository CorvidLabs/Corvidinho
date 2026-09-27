---
id: safe-5-schedule-delete-appends-audit-rows-before-deleting-a-schedule-and-its-run-history-and-fails-closed-like-admin
state: draft
type: bug_fix
base_commit: fbaa84b7cda1bf2b462baea44cad20ef93e0df4f
---

# SAFE-5: /schedule delete appends audit rows before deleting a schedule and its run history, and fails closed like /admin when the audit trail is unavailable

## Intent

SAFE-5: /schedule delete appends audit rows before deleting a schedule and its run history, and fails closed like /admin when the audit trail is unavailable

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- /schedule delete by the owner appends SAFE-5 started then ok rows (action schedule-delete, surface discord:schedule, args digest only) before the schedule and its run history are deleted, and the reply names the row numbers; when the audit trail throws, the chain is keyed and the process has no key, or no trail is wired, it replies 'audit log unavailable (SAFE-5)' and deletes nothing; a non-ADMIN delete gets 'not authorized' and appends denied; a delete that throws after the intent row appends error; tests/discord.schedule.test.ts covers each and fails on main

## No-spec Rationale

Not applicable

---
change: safe-5-tamper-evident-audit-trail-issue-95-captured-slice-append-only-audit-log-schema-v5-update-delete-blocked-by
artifact: testing
---

# Testing

- `tests/audit.log.test.ts`: unkeyed/keyed verify, missing/wrong key, triggers block UPDATE/DELETE, tamper behind triggers detected at first bad row, status line, runPlugin rows (started+ok, denied, safe not logged, raw args absent), fail closed when the DB is unavailable.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-plugins-095 | `tests/audit.log.test.ts` |
| REQ-discord-095 | `tests/audit.log.test.ts` (status line), `tests/memory.store.test.ts` (schema) |

---
module: discord
change: safe-5-tamper-evident-audit-trail-issue-95-captured-slice-append-only-audit-log-schema-v5-update-delete-blocked-by
---

# Delta — discord (audit schema + /status line)

## Added

### REQUIREMENT REQ-discord-095

The shared SQLite store SHALL migrate to schema version 5 with an
append-only `audit_log` table whose UPDATE and DELETE are refused by triggers
(SAFE-5). The shared DB SHALL set a busy timeout so concurrent writers wait
instead of failing. The Discord bridge SHALL verify the audit chain at start
(logged) and `/status` SHALL show a one-line chain summary (entries, OK /
BROKEN at #n / unkeyed / unverifiable without key). Tests SHALL isolate the
data directory.

Acceptance Criteria
- Fresh and upgraded DBs reach schema 5 with `audit_log` and its triggers.
- UPDATE/DELETE on `audit_log` raise an append-only error.
- `/status` includes the audit line when the bridge has a DB.

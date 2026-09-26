---
change: safe-5-tamper-evident-audit-trail-issue-95-captured-slice-append-only-audit-log-schema-v5-update-delete-blocked-by
artifact: context
---

# Context

Issue #95 (M4). Captured **SAFE-5**: destructive actions leave a tamper-evident audit trail I can verify later. Nothing tamper-evident existed (memory soft-delete columns only). Draft SAFE-17 (a Discord admin verify command, extra coverage) is not captured. Review note from the backlog map: keep the HMAC key out of the DB (anyone who can write the DB could re-sign), so the key is a bot-VM env secret.

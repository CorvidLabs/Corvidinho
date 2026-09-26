---
change: safe-5-tamper-evident-audit-trail-issue-95-captured-slice-append-only-audit-log-schema-v5-update-delete-blocked-by
artifact: design
---

# Design

`src/audit/log.ts`: `appendAudit`, `verifyAudit`, `formatAuditLine`, `argsDigest`, `auditKeyFromEnv`, `auditContextFromEnv` (actor/surface from bridge env). Hook lives at the single choke point `runPlugin`. The v4 migration block now records '4' explicitly so v5 applies on upgrade.

---
change: safe-5-tamper-evident-audit-trail-issue-95-captured-slice-append-only-audit-log-schema-v5-update-delete-blocked-by
artifact: requirements
---

# Requirements

1. `audit_log` (schema v5): append-only via triggers; HMAC-SHA256 chain keyed by `CORVIDINHO_AUDIT_HMAC_KEY` (env only); SHA-256 chain when unset (integrity only, reported as unkeyed).
2. `runPlugin`: dangerous runs append `started` before the handler (refuse if that fails — fail closed) and `ok`/`error` after; non-interactive denials append `denied` best-effort. Rows: ts, action, actor, surface, args digest, outcome, exit code — never raw args/content.
3. `verifyAudit` recomputes the chain, reports the first bad row; keyed rows without the key are unverifiable (not ok).
4. Bridge verifies at start (log) and `/status` shows one line.
5. Shared DB: `PRAGMA busy_timeout = 5000`.
6. `bun test` preload isolates `CORVIDINHO_DATA_DIR`.

---
id: safe-5-tamper-evident-audit-trail-issue-95-captured-slice-append-only-audit-log-schema-v5-update-delete-blocked-by
state: archived
type: feature
base_commit: c6d37cfbb3a2c3adccb9faa9ffe3765e8d379955
---

# SAFE-5 tamper-evident audit trail (issue #95 captured slice): append-only audit_log (schema v5, UPDATE/DELETE blocked by triggers) with an HMAC-SHA256 chain keyed by CORVIDINHO_AUDIT_HMAC_KEY from the bot VM env (plain SHA-256 integrity chain when unset); runPlugin records every dangerous plugin run (started then ok/error, fail closed if the intent cannot be recorded) and denied close calls, storing action, actor, surface, args digest and outcome, never raw args; verify at bridge start and a chain-status line in /status; busy_timeout on the shared DB; tests isolate the data dir; draft SAFE-17 Discord verify command left for HI capture

## Intent

SAFE-5 tamper-evident audit trail (issue #95 captured slice): append-only audit_log (schema v5, UPDATE/DELETE blocked by triggers) with an HMAC-SHA256 chain keyed by CORVIDINHO_AUDIT_HMAC_KEY from the bot VM env (plain SHA-256 integrity chain when unset); runPlugin records every dangerous plugin run (started then ok/error, fail closed if the intent cannot be recorded) and denied close calls, storing action, actor, surface, args digest and outcome, never raw args; verify at bridge start and a chain-status line in /status; busy_timeout on the shared DB; tests isolate the data dir; draft SAFE-17 Discord verify command left for HI capture

## Affected Canonical Specs

- `plugins`
- `discord`

## Acceptance Criteria

- Dangerous plugin runs append started then ok/error rows to an append-only audit_log hash chain (HMAC-SHA256 with CORVIDINHO_AUDIT_HMAC_KEY, SHA-256 when unset); a dangerous run whose intent cannot be recorded is refused (fail closed); non-interactive denials are logged best-effort; rows store action, actor, surface, args digest, outcome, exit code — never raw args or content; UPDATE/DELETE blocked by triggers; verifyAudit detects the first tampered row and cannot pass keyed rows without the key; bridge logs the verify result at start and /status shows it; shared DB sets busy_timeout; bun test preload isolates CORVIDINHO_DATA_DIR; fixture tests + SpecSync + fledge verify green

## No-spec Rationale

Not applicable

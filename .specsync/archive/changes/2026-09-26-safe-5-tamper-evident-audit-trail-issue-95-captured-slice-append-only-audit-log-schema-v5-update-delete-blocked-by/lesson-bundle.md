# Lesson bundle — safe-5-tamper-evident-audit-trail-issue-95-captured-slice-append-only-audit-log-schema-v5-update-delete-blocked-by

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: SAFE-5 tamper-evident audit trail (issue #95 captured slice): append-only audit_log (schema v5, UPDATE/DELETE blocked by triggers) with an HMAC-SHA256 chain keyed by CORVIDINHO_AUDIT_HMAC_KEY from the bot VM env (plain SHA-256 integrity chain when unset); runPlugin records every dangerous plugin run (started then ok/error, fail closed if the intent cannot be recorded) and denied close calls, storing action, actor, surface, args digest and outcome, never raw args; verify at bridge start and a chain-status line in /status; busy_timeout on the shared DB; tests isolate the data dir; draft SAFE-17 Discord verify command left for HI capture
- **Kind**: Feature
- **Specs**: plugins, discord
- **Paths**: src/audit/, src/plugins/run.ts, src/store/db.ts, src/discord/bridge.ts, src/discord/slash-types.ts, src/discord/command-handlers/status.ts, bunfig.toml, tests/preload.ts, tests/audit.log.test.ts, tests/memory.store.test.ts, specs/plugins/, specs/discord/
- **Acceptance**: Dangerous plugin runs append started then ok/error rows to an append-only audit_log hash chain (HMAC-SHA256 with CORVIDINHO_AUDIT_HMAC_KEY, SHA-256 when unset); a dangerous run whose intent cannot be recorded is refused (fail closed); non-interactive denials are logged best-effort; rows store action, actor, surface, args digest, outcome, exit code — never raw args or content; UPDATE/DELETE blocked by triggers; verifyAudit detects the first tampered row and cannot pass keyed rows without the key; bridge logs the verify result at start and /status shows it; shared DB sets busy_timeout; bun test preload isolates CORVIDINHO_DATA_DIR; fixture tests + SpecSync + fledge verify green

## Evidence

- Verification commit: `2b1e9a15564c27e1583cf2021dcc3f328faa6b1f`
- Base commit: `c6d37cfbb3a2c3adccb9faa9ffe3765e8d379955`
- Verified by: `specsync check --spec discord --spec plugins`

## From the change's context.md

# Context

Issue #95 (M4). Captured **SAFE-5**: destructive actions leave a tamper-evident audit trail I can verify later. Nothing tamper-evident existed (memory soft-delete columns only). Draft SAFE-17 (a Discord admin verify command, extra coverage) is not captured. Review note from the backlog map: keep the HMAC key out of the DB (anyone who can write the DB could re-sign), so the key is a bot-VM env secret.

## From the change's design.md

# Design

`src/audit/log.ts`: `appendAudit`, `verifyAudit`, `formatAuditLine`, `argsDigest`, `auditKeyFromEnv`, `auditContextFromEnv` (actor/surface from bridge env). Hook lives at the single choke point `runPlugin`. The v4 migration block now records '4' explicitly so v5 applies on upgrade.

## From the change's testing.md

# Testing

- `tests/audit.log.test.ts`: unkeyed/keyed verify, missing/wrong key, triggers block UPDATE/DELETE, tamper behind triggers detected at first bad row, status line, runPlugin rows (started+ok, denied, safe not logged, raw args absent), fail closed when the DB is unavailable.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-plugins-095 | `tests/audit.log.test.ts` |
| REQ-discord-095 | `tests/audit.log.test.ts` (status line), `tests/memory.store.test.ts` (schema) |

## Where these lessons go

- `specs/plugins/context.md`
- `specs/discord/context.md`

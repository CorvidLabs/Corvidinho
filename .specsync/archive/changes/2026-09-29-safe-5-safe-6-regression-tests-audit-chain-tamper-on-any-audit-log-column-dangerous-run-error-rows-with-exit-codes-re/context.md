---
change: safe-5-safe-6-regression-tests-audit-chain-tamper-on-any-audit-log-column-dangerous-run-error-rows-with-exit-codes-re
artifact: context
---

# Context

A QA audit of main (`/home/user/coord/qa-audit.json`, four surviving
findings) found SAFE-5 / SAFE-6 requirements whose code is right on main but
whose tests would not notice a regression. Each gap was shown by a mutation of
the product code that main's full suite still passes (2085 pass, 0 fail at
the audit's base; re-checked on `0f2e2c2`, see testing.md):

- `audit-chain-only-actor-tamper` (REQ-plugins-095): the only tamper tests
  edit `actor`. Shrinking `link()`'s payload in `src/audit/log.ts` to
  `[row.actor, row.keyed]` drops `ts`, `action`, `surface`,
  `args_digest`, `outcome` and `exit_code` from the chain unnoticed.
- `runplugin-error-outcome-unasserted` (REQ-plugins-095): no test reads an
  `error` row or `audit_log.exit_code` from `runPlugin`. Deleting the
  throw-path row and recording every finished run as `ok` (no exit code) in
  `src/plugins/run.ts` passes.
- `rescrub-targets-partial` (REQ-discord-066): the re-scrub-on-open test
  seeds only `discord_sessions.topic` and `memories.key`. Removing the
  `discord_work_tasks` and `schedules` entries and reducing `memories` to
  `["key"]` in `SCRUB_TARGETS` passes.
- `status-audit-line-constant` (REQ-discord-095): /status tests inject a
  constant audit line; the bridge wiring (`src/discord/bridge.ts`, start log
  + `ctx.auditLine`) is untested. Disabling it, or verifying without the key,
  passes.

Leif's 2026-09-28 interview (spec/test hardening wave, no new criteria): add
the missing assertions as tests, prove each catches a mutation, then restore;
if a new test fails on main, fix the code in the same PR (bug-fix) — none
did, so this change is test-only. No `hi` capture (no new criteria). Open
PRs #232 / #233 are not touched (both already landed on main at `0f2e2c2`).

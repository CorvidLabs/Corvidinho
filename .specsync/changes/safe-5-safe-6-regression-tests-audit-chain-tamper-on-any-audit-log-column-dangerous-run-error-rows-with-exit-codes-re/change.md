---
id: safe-5-safe-6-regression-tests-audit-chain-tamper-on-any-audit-log-column-dangerous-run-error-rows-with-exit-codes-re
state: implementing
type: feature
base_commit: 0f2e2c2774635d1dcbdff599cba92dbecf8eebd9
---

# SAFE-5/SAFE-6 regression tests: audit chain tamper on any audit_log column, dangerous-run error rows with exit codes, re-scrub of every listed column, and the bridge start and /status audit line from the real DB and key

## Intent

SAFE-5/SAFE-6 regression tests: audit chain tamper on any audit_log column, dangerous-run error rows with exit codes, re-scrub of every listed column, and the bridge start and /status audit line from the real DB and key

## Affected Canonical Specs

- `plugins`
- `discord`

## Acceptance Criteria

- Test-only (no product code change): tests/audit.log.test.ts breaks a 3-row keyed chain at row 2 when any one of ts, action, actor, surface, args_digest, outcome, exit_code, keyed, prev_hash or hash is edited behind the dropped trigger (verifyAudit brokenAtSeq 2, 'chain BROKEN at #2'), and asserts that a dangerous plugin returning {ok:false, exitCode:3} records started(null) then error(3) and one that throws records started(null) then error(1) while the throw still propagates (REQ-plugins-095); tests/store.scrub.test.ts asserts SCRUB_TARGETS lists and a rules-version bump re-scrubs each REQ-discord-066 column written raw (session topic, work task description and summary, schedule name, description and prompt, schedule run summary and error, memory key and content) to [redacted:<kind>]; tests/discord.status-audit.test.ts asserts the bridge start log and /status show 'Audit: 2 entries · chain OK (keyed)' from its own DB with CORVIDINHO_AUDIT_HMAC_KEY, 'chain BROKEN at #1' after tampering, and the unverifiable line without the key (REQ-discord-095). Each new test fails under the mutation that the base suite misses and passes on main.

## No-spec Rationale

Not applicable

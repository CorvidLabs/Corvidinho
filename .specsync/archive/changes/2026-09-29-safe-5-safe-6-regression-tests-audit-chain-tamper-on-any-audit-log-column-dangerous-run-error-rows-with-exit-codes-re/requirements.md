---
change: safe-5-safe-6-regression-tests-audit-chain-tamper-on-any-audit-log-column-dangerous-run-error-rows-with-exit-codes-re
artifact: requirements
---

# Requirements

- SAFE-5 (`hi/safe.md`, captured): destructive actions leave a tamper-evident audit trail I can verify later.
- SAFE-6 (`hi/safe.md`, captured): vendor-key-looking secrets are scrubbed before sessions are saved, and history is re-scrubbed when rules tighten.
- Modify REQ-plugins-095 (delta `deltas/plugins.md`): full existing text kept; two acceptance bullets make explicit what it already requires — an edit to any one stored column of a keyed row fails verify at that row, and a failing / throwing dangerous run appends `started` then `error` with its exit code (1 for a throw).
- Modify REQ-discord-066 (delta `deltas/discord.md`): one acceptance bullet — each listed text column written raw is `[redacted:<kind>]` after the next re-scrubbing open, and `SCRUB_TARGETS` lists each.
- Modify REQ-discord-095 (delta `deltas/discord.md`): one acceptance bullet — the bridge start log and `/status` show the line `verifyAudit` computes over the bridge's own DB with `CORVIDINHO_AUDIT_HMAC_KEY` from its env; `/status` reflects tampering after start; without the key, keyed rows are unverifiable.
- No product code, REQ id, env var, config key, schema version, command, flag or package version is added or changed.

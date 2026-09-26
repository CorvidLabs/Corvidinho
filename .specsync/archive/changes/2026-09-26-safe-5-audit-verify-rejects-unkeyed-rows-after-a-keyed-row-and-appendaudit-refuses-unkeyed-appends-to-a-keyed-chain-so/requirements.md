---
change: safe-5-audit-verify-rejects-unkeyed-rows-after-a-keyed-row-and-appendaudit-refuses-unkeyed-appends-to-a-keyed-chain-so
artifact: requirements
---

# Requirements

- SAFE-5 (captured in `hi/safe.md`): destructive actions leave a tamper-evident audit trail I can verify later.
- Modify REQ-plugins-095 (delta `deltas/plugins.md`): once the chain holds a keyed row it stays keyed; a keyless append after a keyed row is refused and verify reports an unkeyed row after a keyed row as the first tampered row; an unkeyed prefix followed by keyed rows still verifies.
- No new REQ, env var, command, schema or package version.

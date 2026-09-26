---
change: safe-5-audit-verify-rejects-unkeyed-rows-after-a-keyed-row-and-appendaudit-refuses-unkeyed-appends-to-a-keyed-chain-so
artifact: testing
---

# Testing

Before the fix, `bun test tests/audit.keyed-downgrade.test.ts` gave 1 pass and 3 fail: verify with the key returned `{"ok":true,"count":3,"keyedRows":1,"unkeyedRows":2,"keyAvailable":true}` for rows 2-3 relinked unkeyed with row 2's actor changed to `111`; a keyless `appendAudit` after a keyed row did not throw; and a keyless dangerous `runPlugin` run after a keyed one was allowed. After the fix it gives 4 pass and 0 fail. `tests/audit.log.test.ts` and `tests/discord.admin-slash.test.ts` stay green.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-095` | `tests/audit.keyed-downgrade.test.ts` | three keyed rows, drop `audit_log_no_update`, rewrite row 2's actor and relink rows 2-3 as unkeyed SHA-256: `verifyAudit(db, KEY)` is `ok: false, brokenAtSeq: 2` and the line is `Audit: 3 entries · chain BROKEN at #2`. |
| `REQ-plugins-095` | `tests/audit.keyed-downgrade.test.ts` | `appendAudit` without a key after a keyed row throws; the chain still verifies with the key (1 keyed, 0 unkeyed). |
| `REQ-plugins-095` | `tests/audit.keyed-downgrade.test.ts` | `runPlugin danger-ping` with the key, then without it: the second run is refused with `audit log unavailable`; the chain verifies with 2 keyed rows. |
| `REQ-plugins-095` | `tests/audit.keyed-downgrade.test.ts` | two unkeyed rows then one keyed row verify with the key as `chain OK (mixed keyed/unkeyed)`. |
| `REQ-plugins-095` | `tests/audit.log.test.ts` | existing unkeyed/keyed/wrong-key, append-only triggers, first-bad-row, status line and runPlugin started/ok/denied/fail-closed cases still pass. |

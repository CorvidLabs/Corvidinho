---
change: safe-5-audit-verify-rejects-unkeyed-rows-after-a-keyed-row-and-appendaudit-refuses-unkeyed-appends-to-a-keyed-chain-so
artifact: plan
---

# Plan

1. Add `tests/audit.keyed-downgrade.test.ts` reproducing the downgrade relink, the keyless append after a keyed row, the keyless dangerous `runPlugin` run, and the legacy mixed chain; confirm it fails on main.
2. `verifyAudit` rejects an unkeyed row after a keyed row; `appendAudit` refuses a keyless append after a keyed row (`src/audit/log.ts`).
3. Modify REQ-plugins-095 (delta); update the plugins spec invariant, error row and files list.
4. Run specsync check, tsc, bun test and fledge verify.

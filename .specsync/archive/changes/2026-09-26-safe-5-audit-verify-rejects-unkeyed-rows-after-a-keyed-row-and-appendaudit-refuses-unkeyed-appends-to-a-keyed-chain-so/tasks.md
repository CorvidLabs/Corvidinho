---
change: safe-5-audit-verify-rejects-unkeyed-rows-after-a-keyed-row-and-appendaudit-refuses-unkeyed-appends-to-a-keyed-chain-so
artifact: tasks
---

# Tasks

- [x] Regression test reproducing the keyed-to-unkeyed relink and keyless append (fails before fix).
- [x] `verifyAudit` rejects an unkeyed row after a keyed row.
- [x] `appendAudit` refuses a keyless append after a keyed row; keyless dangerous runs fail closed.
- [x] Delta modifies REQ-plugins-095; spec invariant, error row and files list updated.
- [x] specsync check, tsc, bun test, fledge verify green.

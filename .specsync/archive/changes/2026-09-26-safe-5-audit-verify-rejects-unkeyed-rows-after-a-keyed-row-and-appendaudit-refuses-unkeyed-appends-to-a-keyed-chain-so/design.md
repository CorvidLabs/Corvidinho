---
change: safe-5-audit-verify-rejects-unkeyed-rows-after-a-keyed-row-and-appendaudit-refuses-unkeyed-appends-to-a-keyed-chain-so
artifact: design
---

# Design

- `verifyAudit`: while walking rows, an unkeyed row seen after at least one keyed row is a break (`ok: false`, `brokenAtSeq` = that row). A keyed row is only accepted after it verifies with the key, so the rule is only reachable with a key supplied. `formatAuditLine` is unchanged and prints `chain BROKEN at #N`.
- `appendAudit`: the transaction reads the last row's `keyed` flag with its hash; if it is keyed and no key was passed it throws before inserting. `runPlugin` refuses the dangerous run (exit 2, `audit log unavailable`), and the chain stays keyed and verifiable.
- An unkeyed prefix followed by keyed rows is untouched and still reports `mixed keyed/unkeyed`.
- No new env var, command, flag or schema change. Rewriting the whole chain as unkeyed and truncating the tail need an anchor outside the DB and are left as follow-ups.

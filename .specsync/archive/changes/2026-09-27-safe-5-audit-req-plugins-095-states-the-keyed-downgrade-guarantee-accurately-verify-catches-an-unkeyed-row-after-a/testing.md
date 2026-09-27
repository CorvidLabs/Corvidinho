---
change: safe-5-audit-req-plugins-095-states-the-keyed-downgrade-guarantee-accurately-verify-catches-an-unkeyed-row-after-a
artifact: testing
---

# Testing

New case in `tests/audit.keyed-downgrade.test.ts`: two unkeyed rows, then two
keyed rows (`chain OK (mixed keyed/unkeyed)`); row 4's actor is rewritten to
`111` and row 4 is relinked as an unkeyed SHA-256 link after keyed row 3.
With main's `src/audit/log.ts` swapped in, the file gives 1 pass and 4 fail
(this case returns ok); with the branch code it gives 5 pass and 0 fail.

The whole-chain downgrade (first keyed row edited and every row relinked
unkeyed) was reproduced with a throwaway test on the PR head: verify with the
key returns `ok: true, keyedRows: 0, unkeyedRows: 3`. It is not pinned as a
passing test, since that would lock in the gap; the spec now states it.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-095` | `tests/audit.keyed-downgrade.test.ts` | keyed rows 1-3, row 2's actor rewritten and rows 2-3 relinked unkeyed: `verifyAudit(db, KEY)` is `ok: false, brokenAtSeq: 2`, line `Audit: 3 entries · chain BROKEN at #2`. |
| `REQ-plugins-095` | `tests/audit.keyed-downgrade.test.ts` | unkeyed rows 1-2, keyed rows 3-4, row 4's actor rewritten and relinked unkeyed behind keyed row 3: `ok: false, brokenAtSeq: 4`, line `Audit: 4 entries · chain BROKEN at #4`. |
| `REQ-plugins-095` | `tests/audit.keyed-downgrade.test.ts` | keyless `appendAudit` after a keyed row throws; keyless dangerous `runPlugin` after a keyed run is refused (`audit log unavailable`); an unkeyed prefix then keyed rows verifies as `mixed keyed/unkeyed`. |
| `REQ-plugins-095` | `tests/audit.log.test.ts` | existing started/ok/denied rows, fail-closed started row, wrong/missing key and first-bad-row cases still pass. |

---
change: safe-5-audit-req-plugins-095-states-the-keyed-downgrade-guarantee-accurately-verify-catches-an-unkeyed-row-after-a
artifact: context
---

# Context

Adversarial review of PR #209 (bug report store-memory-audit-5, SAFE-5,
REQ-plugins-095). The PR makes `verifyAudit` report an unkeyed row that
follows a keyed row as the break and makes a keyless `appendAudit` refuse to
extend a keyed chain. That closes the reported relink (edit keyed row 2,
relink rows 2-3 unkeyed).

Review finding: an attacker who can write the DB but not read the key can
still edit the first keyed row and relink it with every later row as unkeyed
SHA-256 links. With the key, verify then returns
`{"ok":true,"count":3,"keyedRows":0,"unkeyedRows":3,"keyAvailable":true}`
(`chain OK (unkeyed — set CORVIDINHO_AUDIT_HMAC_KEY)`), reproduced on the PR
head with a throwaway test. The PR body lists this as a follow-up, but the new
REQ-plugins-095 text ("so keyed rows cannot be rewritten and relinked as plain
SHA-256 links") and acceptance criterion ("A keyed row edited and relinked,
with the rows after it, ... fails verify") claim it is caught, which is false
for the first keyed row.

Constraints: nothing inside the DB can tell a legacy unkeyed chain from a
fully downgraded one, so a real fix needs an anchor outside the DB. That is a
new product surface not captured in `hi/` (PROCESS-1), so this change states
the guarantee accurately instead of inventing one. No runtime behaviour, env
var, command, flag or schema change.

---
id: safe-5-audit-verify-rejects-unkeyed-rows-after-a-keyed-row-and-appendaudit-refuses-unkeyed-appends-to-a-keyed-chain-so
state: implementing
type: bug_fix
base_commit: 05b269af23ea2be9e9c41966f6cf9ee41dfeac02
---

# SAFE-5 audit verify rejects unkeyed rows after a keyed row and appendAudit refuses unkeyed appends to a keyed chain so keyed rows cannot be relinked as unkeyed SHA-256

## Intent

SAFE-5 audit verify rejects unkeyed rows after a keyed row and appendAudit refuses unkeyed appends to a keyed chain so keyed rows cannot be relinked as unkeyed SHA-256

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- With CORVIDINHO_AUDIT_HMAC_KEY supplied, verifyAudit fails (ok false, brokenAtSeq = first such row, /status says chain BROKEN) on any unkeyed row that follows a keyed row, so a keyed row edited and relinked with its tail as unkeyed SHA-256 links is detected at the edited row; appendAudit without a key refuses to append after a keyed row (throws, so runPlugin fails closed for dangerous plugins) and the chain stays verifiable; a legacy unkeyed prefix followed by keyed rows still verifies as chain OK (mixed keyed/unkeyed)

## No-spec Rationale

Not applicable

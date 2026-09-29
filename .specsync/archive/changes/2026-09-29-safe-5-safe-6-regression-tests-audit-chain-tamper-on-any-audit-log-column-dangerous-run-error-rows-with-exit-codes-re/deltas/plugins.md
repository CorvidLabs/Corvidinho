---
module: plugins
change: safe-5-safe-6-regression-tests-audit-chain-tamper-on-any-audit-log-column-dangerous-run-error-rows-with-exit-codes-re
---

# Delta — plugins (SAFE-5 audit chain: tamper on any column, error rows with exit codes)

## Modified

### REQUIREMENT REQ-plugins-095

Every run of a plugin command marked dangerous SHALL leave a tamper-evident
audit trail (SAFE-5): `runPlugin` SHALL append a `started` row to the shared
append-only `audit_log` before the handler runs and SHALL refuse the run if
that row cannot be written (fail closed), then append an `ok` or `error` row.
A dangerous run denied in non-interactive mode SHALL be logged as `denied`
(best effort). Rows SHALL hold the action, actor, surface, a SHA-256 digest of
the argv, the outcome and exit code — never raw args or memory content.

The chain SHALL be HMAC-SHA256 keyed by `CORVIDINHO_AUDIT_HMAC_KEY` from the
bot-VM environment (never stored in the DB); without a key it is a SHA-256
integrity chain reported as unkeyed. `verifyAudit` SHALL recompute the chain
and report the first tampered row; keyed rows are unverifiable without the key.
Once the chain holds a keyed row it SHALL stay keyed: `appendAudit` without a
key SHALL refuse to append after a keyed row, and `verifyAudit` SHALL report
an unkeyed row that follows a keyed row as the first tampered row, so a keyed
row cannot be rewritten and relinked as a plain SHA-256 link while a keyed row
before it stays. An unkeyed prefix followed by keyed rows (key set later)
SHALL still verify. Rewriting every keyed row, from the first keyed row on, as
unkeyed links, or dropping the newest rows, is not detectable from the DB
alone; catching it needs an anchor kept outside the DB.

Acceptance Criteria
- Allowed dangerous run appends started + ok rows; raw args are not stored.
- Non-interactive denial appends a denied row; safe plugins append nothing.
- A dangerous run is refused when its started row cannot be written.
- Tampering is detected at the first bad row; wrong/missing key fails verify.
- A keyed row that follows a keyed row, edited and relinked with the rows after it as unkeyed SHA-256 links, fails verify with the key at that row (`chain BROKEN at #N`).
- Without the key, appending after a keyed row is refused, so a keyless dangerous run fails closed and the chain stays keyed; an unkeyed prefix followed by keyed rows still verifies (`mixed keyed/unkeyed`).
- An edit to any one stored column of a keyed row made behind a dropped update trigger — `ts`, `action`, `actor`, `surface`, `args_digest`, `outcome`, `exit_code`, `keyed`, `prev_hash` or `hash` — fails verify with the key at that row (`chain BROKEN at #N`).
- A dangerous run whose handler returns `ok: false` appends `started` (no exit code) then `error` with the handler's exit code; a dangerous run whose handler throws appends `started` then `error` with exit code 1, and the throw still reaches the caller.

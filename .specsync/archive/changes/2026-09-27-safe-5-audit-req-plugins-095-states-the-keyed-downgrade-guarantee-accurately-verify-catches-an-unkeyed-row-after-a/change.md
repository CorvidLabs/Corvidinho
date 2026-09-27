---
id: safe-5-audit-req-plugins-095-states-the-keyed-downgrade-guarantee-accurately-verify-catches-an-unkeyed-row-after-a
state: archived
type: bug_fix
base_commit: fc2f94b5e0e41450b17f5d261e3624255fee730b
---

# SAFE-5 audit REQ-plugins-095 states the keyed-downgrade guarantee accurately: verify catches an unkeyed row after a keyed row, but downgrading every keyed row or dropping the newest rows needs an out-of-DB anchor; go-live doc says a keyless process refuses dangerous runs on a keyed chain

## Intent

SAFE-5 audit REQ-plugins-095 states the keyed-downgrade guarantee accurately: verify catches an unkeyed row after a keyed row, but downgrading every keyed row or dropping the newest rows needs an out-of-DB anchor; go-live doc says a keyless process refuses dangerous runs on a keyed chain

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- REQ-plugins-095 and the src/audit/log.ts module comment no longer claim that keyed rows can never be relinked as plain SHA-256: they state that verify with the key reports an unkeyed row that follows a keyed row as the break, and that downgrading every keyed row (from the first keyed row on) or dropping the newest rows is not detectable from the DB alone (needs an out-of-DB anchor); the relink acceptance criterion names a keyed row that follows a keyed row, with a regression test for a legacy unkeyed prefix followed by keyed rows where the last keyed row is edited and relinked unkeyed (fails verify at that row); docs/DISCORD-GO-LIVE.md says a process without the key refuses dangerous plugin runs and /admin changes once the chain is keyed; no runtime behaviour change

## No-spec Rationale

Not applicable

# Lesson bundle — safe-5-audit-req-plugins-095-states-the-keyed-downgrade-guarantee-accurately-verify-catches-an-unkeyed-row-after-a

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: SAFE-5 audit REQ-plugins-095 states the keyed-downgrade guarantee accurately: verify catches an unkeyed row after a keyed row, but downgrading every keyed row or dropping the newest rows needs an out-of-DB anchor; go-live doc says a keyless process refuses dangerous runs on a keyed chain
- **Kind**: BugFix
- **Specs**: plugins
- **Paths**: src/audit/log.ts, tests/audit.keyed-downgrade.test.ts, specs/plugins/requirements.md, specs/plugins/plugins.spec.md, docs/DISCORD-GO-LIVE.md
- **Acceptance**: REQ-plugins-095 and the src/audit/log.ts module comment no longer claim that keyed rows can never be relinked as plain SHA-256: they state that verify with the key reports an unkeyed row that follows a keyed row as the break, and that downgrading every keyed row (from the first keyed row on) or dropping the newest rows is not detectable from the DB alone (needs an out-of-DB anchor); the relink acceptance criterion names a keyed row that follows a keyed row, with a regression test for a legacy unkeyed prefix followed by keyed rows where the last keyed row is edited and relinked unkeyed (fails verify at that row); docs/DISCORD-GO-LIVE.md says a process without the key refuses dangerous plugin runs and /admin changes once the chain is keyed; no runtime behaviour change

## Evidence

- Verification commit: `e96cd73aeb33485755d3244ae85f66b6463cb58c`
- Base commit: `fc2f94b5e0e41450b17f5d261e3624255fee730b`
- Verified by: `specsync check --spec plugins`

## From the change's context.md

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

## From the change's design.md

# Design

- REQ-plugins-095 (delta `deltas/plugins.md`, Modified, full text): the
  keyed-stays-keyed rule is kept; the claim is narrowed to "a keyed row cannot
  be relinked as plain SHA-256 while a keyed row before it stays", and one
  sentence says that rewriting every keyed row from the first keyed row on,
  or dropping the newest rows, is not detectable from the DB alone and needs
  an anchor kept outside the DB. The relink acceptance criterion names "a
  keyed row that follows a keyed row".
- `specs/plugins/plugins.spec.md`: the SAFE-5 audit-chain paragraph gets the
  same limit; version 45; change-log row.
- `src/audit/log.ts`: module comment only, same wording. No code change.
- `docs/DISCORD-GO-LIVE.md` E.7 audit-key row: once the chain holds a keyed
  row, a process without the key refuses dangerous plugin runs and `/admin`
  changes, and an unkeyed row after a keyed row reads as `chain BROKEN at #N`.
- The out-of-DB anchor itself is not designed here: it is new product surface
  that needs a captured HI want first.

## From the change's testing.md

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

## Where these lessons go

- `specs/plugins/context.md`

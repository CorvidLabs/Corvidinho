# Lesson bundle — safe-5-audit-verify-rejects-unkeyed-rows-after-a-keyed-row-and-appendaudit-refuses-unkeyed-appends-to-a-keyed-chain-so

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: SAFE-5 audit verify rejects unkeyed rows after a keyed row and appendAudit refuses unkeyed appends to a keyed chain so keyed rows cannot be relinked as unkeyed SHA-256
- **Kind**: BugFix
- **Specs**: plugins
- **Paths**: src/audit/log.ts, tests/audit.keyed-downgrade.test.ts
- **Acceptance**: With CORVIDINHO_AUDIT_HMAC_KEY supplied, verifyAudit fails (ok false, brokenAtSeq = first such row, /status says chain BROKEN) on any unkeyed row that follows a keyed row, so a keyed row edited and relinked with its tail as unkeyed SHA-256 links is detected at the edited row; appendAudit without a key refuses to append after a keyed row (throws, so runPlugin fails closed for dangerous plugins) and the chain stays verifiable; a legacy unkeyed prefix followed by keyed rows still verifies as chain OK (mixed keyed/unkeyed)

## Evidence

- Verification commit: `508bbc9d5aae40d4c7527eb6bd54c95730ee5307`
- Base commit: `05b269af23ea2be9e9c41966f6cf9ee41dfeac02`
- Verified by: `specsync check --spec plugins`

## From the change's context.md

# Context

Bug report store-memory-audit-5 (medium, SAFE-5, REQ-plugins-095).
`verifyAudit` in `src/audit/log.ts` verified every `keyed = 0` row with plain
SHA-256 even when the HMAC key was supplied and a keyed row came before it, and
returned ok. A writer who can change the DB but not read the key could drop the
`audit_log_no_update` trigger, edit a keyed row (e.g. who ran
`memory-forget`), set `keyed = 0` on it and every later row, and relink them
with SHA-256. Verify with the real key then said ok and `/status` showed
`chain OK (mixed keyed/unkeyed)`, which is the exact case the module comment
says the HMAC prevents. Repro on main: three keyed rows, row 2 actor rewritten
to `111` and rows 2-3 relinked unkeyed gave
`{"ok":true,"count":3,"keyedRows":1,"unkeyedRows":2,"keyAvailable":true}`.

Constraints: minimal bug fix; no new env vars, commands or schema; no package
bump or CHANGELOG/STATUS edits. Row content is untrusted data. The out-of-DB
tail anchor (truncation, whole-chain downgrade) and keeping the key out of
spawned agent envs are separate follow-ups.

## From the change's design.md

# Design

- `verifyAudit`: while walking rows, an unkeyed row seen after at least one keyed row is a break (`ok: false`, `brokenAtSeq` = that row). A keyed row is only accepted after it verifies with the key, so the rule is only reachable with a key supplied. `formatAuditLine` is unchanged and prints `chain BROKEN at #N`.
- `appendAudit`: the transaction reads the last row's `keyed` flag with its hash; if it is keyed and no key was passed it throws before inserting. `runPlugin` refuses the dangerous run (exit 2, `audit log unavailable`), and the chain stays keyed and verifiable.
- An unkeyed prefix followed by keyed rows is untouched and still reports `mixed keyed/unkeyed`.
- No new env var, command, flag or schema change. Rewriting the whole chain as unkeyed and truncating the tail need an anchor outside the DB and are left as follow-ups.

## From the change's testing.md

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

## Where these lessons go

- `specs/plugins/context.md`

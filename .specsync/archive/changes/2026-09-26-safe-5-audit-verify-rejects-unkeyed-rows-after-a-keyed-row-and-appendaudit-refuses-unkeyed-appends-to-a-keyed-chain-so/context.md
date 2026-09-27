---
change: safe-5-audit-verify-rejects-unkeyed-rows-after-a-keyed-row-and-appendaudit-refuses-unkeyed-appends-to-a-keyed-chain-so
artifact: context
---

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

---
change: safe-5-safe-6-regression-tests-audit-chain-tamper-on-any-audit-log-column-dangerous-run-error-rows-with-exit-codes-re
artifact: design
---

# Design

Tests only, reusing the existing fixtures:

- `tests/audit.log.test.ts` — a table of ten single-column edits (`ts`,
  `action`, `actor`, `surface`, `args_digest`, `outcome`,
  `exit_code`, `keyed`, `prev_hash`, `hash`), one test each: fresh
  in-memory DB, three keyed rows (`denied`, exit 2, fixed `now`), verify
  ok, `DROP TRIGGER audit_log_no_update`, edit row 2, expect
  `{ ok: false, brokenAtSeq: 2 }` and `Audit: 3 entries · chain BROKEN at #2`.
  In the "runPlugin records dangerous actions" block, two dangerous test
  plugins are registered in the in-process registry (one returns
  `{ ok: false, exitCode: 3 }`, one throws); rows are read back with
  `action, outcome, exit_code` and the chain must still verify. The block now
  resets the registry after each test.
- `tests/store.scrub.test.ts` — a new describe with one row per listed
  column (`[table, column, fake secret, kind]`, a different vendor kind per
  column). One test asserts `SCRUB_TARGETS` lists each; the other writes the
  raw rows with SQL (around the stores, as an older build would have), sets
  `scrub_rules_version` to 0, reopens the file DB and expects
  `old [redacted:<kind>]` in every column, then a no-op second pass.
- `tests/discord.status-audit.test.ts` (new) — `startBridge` with the
  null gateway, an in-memory DB holding two keyed rows and
  `CORVIDINHO_AUDIT_HMAC_KEY` in the bridge env (the `discord.spend`
  bridge pattern). `console.log` is captured during start for the
  `[discord] Audit:` line; `/status` goes through `handlers.onSlash`.
  After start the test drops the trigger and edits row 1, and `/status` must
  show `chain BROKEN at #1`. A second test starts with an empty key and
  expects the unverifiable line at start and in `/status`.

Fake secrets are built at runtime from the file's existing `FAKE` table; no
network, no live Discord, data dir isolated (temp dirs / `:memory:`).

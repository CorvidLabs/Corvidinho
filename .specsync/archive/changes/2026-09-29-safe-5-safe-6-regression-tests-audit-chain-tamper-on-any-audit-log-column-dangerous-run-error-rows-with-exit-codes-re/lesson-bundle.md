# Lesson bundle — safe-5-safe-6-regression-tests-audit-chain-tamper-on-any-audit-log-column-dangerous-run-error-rows-with-exit-codes-re

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: SAFE-5/SAFE-6 regression tests: audit chain tamper on any audit_log column, dangerous-run error rows with exit codes, re-scrub of every listed column, and the bridge start and /status audit line from the real DB and key
- **Kind**: Feature
- **Specs**: plugins, discord
- **Paths**: tests/audit.log.test.ts, tests/store.scrub.test.ts, tests/discord.status-audit.test.ts, specs/discord/discord.spec.md
- **Acceptance**: Test-only (no product code change): tests/audit.log.test.ts breaks a 3-row keyed chain at row 2 when any one of ts, action, actor, surface, args_digest, outcome, exit_code, keyed, prev_hash or hash is edited behind the dropped trigger (verifyAudit brokenAtSeq 2, 'chain BROKEN at #2'), and asserts that a dangerous plugin returning {ok:false, exitCode:3} records started(null) then error(3) and one that throws records started(null) then error(1) while the throw still propagates (REQ-plugins-095); tests/store.scrub.test.ts asserts SCRUB_TARGETS lists and a rules-version bump re-scrubs each REQ-discord-066 column written raw (session topic, work task description and summary, schedule name, description and prompt, schedule run summary and error, memory key and content) to [redacted:<kind>]; tests/discord.status-audit.test.ts asserts the bridge start log and /status show 'Audit: 2 entries · chain OK (keyed)' from its own DB with CORVIDINHO_AUDIT_HMAC_KEY, 'chain BROKEN at #1' after tampering, and the unverifiable line without the key (REQ-discord-095). Each new test fails under the mutation that the base suite misses and passes on main.

## Evidence

- Verification commit: `23e33d547dd13f4bd302d96f21f4cc5b71728847`
- Base commit: `0f2e2c2774635d1dcbdff599cba92dbecf8eebd9`
- Verified by: `specsync check --spec discord --spec plugins`

## From the change's context.md

# Context

A QA audit of main (`/home/user/coord/qa-audit.json`, four surviving
findings) found SAFE-5 / SAFE-6 requirements whose code is right on main but
whose tests would not notice a regression. Each gap was shown by a mutation of
the product code that main's full suite still passes (2085 pass, 0 fail at
the audit's base; re-checked on `0f2e2c2`, see testing.md):

- `audit-chain-only-actor-tamper` (REQ-plugins-095): the only tamper tests
  edit `actor`. Shrinking `link()`'s payload in `src/audit/log.ts` to
  `[row.actor, row.keyed]` drops `ts`, `action`, `surface`,
  `args_digest`, `outcome` and `exit_code` from the chain unnoticed.
- `runplugin-error-outcome-unasserted` (REQ-plugins-095): no test reads an
  `error` row or `audit_log.exit_code` from `runPlugin`. Deleting the
  throw-path row and recording every finished run as `ok` (no exit code) in
  `src/plugins/run.ts` passes.
- `rescrub-targets-partial` (REQ-discord-066): the re-scrub-on-open test
  seeds only `discord_sessions.topic` and `memories.key`. Removing the
  `discord_work_tasks` and `schedules` entries and reducing `memories` to
  `["key"]` in `SCRUB_TARGETS` passes.
- `status-audit-line-constant` (REQ-discord-095): /status tests inject a
  constant audit line; the bridge wiring (`src/discord/bridge.ts`, start log
  + `ctx.auditLine`) is untested. Disabling it, or verifying without the key,
  passes.

Leif's 2026-09-28 interview (spec/test hardening wave, no new criteria): add
the missing assertions as tests, prove each catches a mutation, then restore;
if a new test fails on main, fix the code in the same PR (bug-fix) — none
did, so this change is test-only. No `hi` capture (no new criteria). Open
PRs #232 / #233 are not touched (both already landed on main at `0f2e2c2`).

## From the change's design.md

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

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-095` | `tests/audit.log.test.ts` › "audit chain (SAFE-5)" › "tampering with <column> on row 2 is detected at row 2" (10 tests) | Three keyed rows (`denied`, exit 2); after `DROP TRIGGER audit_log_no_update`, an edit to any one of `ts`, `action`, `actor`, `surface`, `args_digest`, `outcome`, `exit_code`, `keyed`, `prev_hash`, `hash` on row 2 gives `verifyAudit(db, key)` → `{ ok: false, brokenAtSeq: 2 }` and `Audit: 3 entries · chain BROKEN at #2`. Fails when `link()`'s payload shrinks to `[actor, keyed]` (A1, 6 tests fail) and when any one of `ts`, `action`, `surface`, `args_digest`, `outcome`, `exit_code` is dropped from it (A2–A7, 1 test fails each). |
| `REQ-plugins-095` | `tests/audit.log.test.ts` › "runPlugin records dangerous actions (SAFE-5)" › "failing and throwing dangerous runs: started + error with the exit code" | A dangerous plugin returning `{ ok: false, exitCode: 3 }` and one that throws (the throw still rejects `runPlugin`) leave rows `started(null)`, `error(3)`, `started(null)`, `error(1)`; the chain verifies. Fails when the throw-path row is removed and every finished run is recorded `ok` with no exit code (B1), when the finished row drops its exit code (B2), and when only the throw-path row is removed (B3). |
| `REQ-discord-066` | `tests/store.scrub.test.ts` › "re-scrub covers every column REQ-discord-066 lists" › "SCRUB_TARGETS lists each of them" and "raw work task, schedule, run summary/error and memory rows are scrubbed on next open" | A different runtime-built fake vendor key written raw into each of `discord_sessions.topic`, `discord_work_tasks.description/summary`, `schedules.name/description/prompt`, `schedule_runs.summary/error`, `memories.key/content`; with `scrub_rules_version` set to 0 the next open leaves `old [redacted:<kind>]` in every one, and a second pass changes nothing. Fails when `discord_work_tasks` and `schedules` are removed and `memories` reduced to `["key"]` (C1), and when any single listed column is removed from `SCRUB_TARGETS` (10 mutations). |
| `REQ-discord-095` | `tests/discord.status-audit.test.ts` › "bridge audit line (REQ-discord-095 / SAFE-5)" | `startBridge` over an in-memory DB with two keyed rows and `CORVIDINHO_AUDIT_HMAC_KEY` in the bridge env logs exactly `[discord] Audit: 2 entries · chain OK (keyed)` at start, and `/status` (via `handlers.onSlash`) shows `Audit: 2 entries · chain OK (keyed)`; after row 1 is tampered behind the dropped trigger, `/status` shows `Audit: 2 entries · chain BROKEN at #1`. With an empty key the start log and `/status` show `cannot verify keyed rows (CORVIDINHO_AUDIT_HMAC_KEY not set)`. Fails when the bridge audit line is not wired (D1, both tests), when `verifyAudit` runs without the key (D2), and when the line is computed once at start and repeated (D3). |
| `REQ-plugins-095`, `REQ-discord-066`, `REQ-discord-095` | existing tests in the three files | Unchanged tests still pass: `tests/audit.log.test.ts` 18 pass, `tests/store.scrub.test.ts` 19 pass, `tests/discord.status-audit.test.ts` 2 pass on the branch. |

## Mutation proof

Run in a scratch worktree of main (`0f2e2c2`). For each mutation: apply it to
main's source, run main's related tests and (for the audit findings' own
mutations) main's full suite, copy the branch's test files in and run them,
then restore with `git checkout` (worktree clean afterwards).

| Id | Mutation (source on main) | Main's related tests | Main's full suite | New tests |
|---|---|---|---|---|
| A1 | `src/audit/log.ts` `link()` payload `[row.actor, row.keyed]` | 12 pass, 0 fail | 2113 pass, 0 fail | 6 fail |
| A2–A7 | drop one of `ts`, `action`, `surface`, `args_digest`, `outcome`, `exit_code` from the payload | 12 pass, 0 fail each | — | 1 fail each |
| B1 | `src/plugins/run.ts`: no throw-path row; finished row `safeRecord(cmd.name, args, "ok")` | 12 pass, 0 fail | 2113 pass, 0 fail | 1 fail |
| B2 | finished row without `result.exitCode` | 12 pass, 0 fail | — | 1 fail |
| B3 | no throw-path row only | 12 pass, 0 fail | — | 1 fail |
| C1 | `src/store/scrub.ts`: drop `discord_work_tasks` and `schedules`; `memories` → `["key"]` | 100 pass, 0 fail | 2113 pass, 0 fail | 2 fail |
| C-drop-* | drop one listed column: `topic`, work `description` / `summary`, schedule `name` / `description` / `prompt`, run `summary` / `error`, memory `key` / `content` | 0 fail for work, schedule and memory `content` columns; 1 fail for `topic`, run `summary` / `error`, memory `key` (already pinned elsewhere) | — | 2–3 fail each |
| D1 | `src/discord/bridge.ts`: `const auditLine = false ? … : undefined` | 73 pass, 0 fail | 2113 pass, 0 fail | 2 fail |
| D2 | `verifyAudit(db)` without the key | 73 pass, 0 fail | 2113 pass, 0 fail | 1 fail |
| D3 | line computed once at start, repeated by `/status` | 73 pass, 0 fail | 2113 pass, 0 fail | 1 fail |

Main's related tests: A/B `tests/audit.log.test.ts`, `tests/audit.keyed-downgrade.test.ts`;
C `tests/store.scrub.test.ts`, `tests/agent.spend.test.ts`, `tests/watch.session-store.durable.test.ts`, `tests/discord.session-thread.unit.test.ts`, `tests/scheduler.ask-outbox.test.ts`;
D `tests/audit.log.test.ts`, `tests/discord.admin-slash.test.ts`, `tests/discord.spend.test.ts`.
On unmutated main the new tests pass (18 / 19 / 2 pass, 0 fail), so no
product code is changed.

## Gates

```bash
bun test tests/audit.log.test.ts tests/store.scrub.test.ts tests/discord.status-audit.test.ts
bun test
bunx tsc --noEmit
hi check
specsync check --require-coverage 100
specsync change audit
fledge lanes run verify --non-interactive
```

## Where these lessons go

- `specs/plugins/context.md`
- `specs/discord/context.md`

---
change: safe-5-safe-6-regression-tests-audit-chain-tamper-on-any-audit-log-column-dangerous-run-error-rows-with-exit-codes-re
artifact: testing
---

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

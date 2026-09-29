---
change: safe-5-safe-6-regression-tests-audit-chain-tamper-on-any-audit-log-column-dangerous-run-error-rows-with-exit-codes-re
artifact: tasks
---

# Tasks

- [x] Re-check the four audit findings on current main (`0f2e2c2`)
- [x] `tests/audit.log.test.ts`: tamper on each of the ten stored columns breaks the keyed chain at that row (REQ-plugins-095)
- [x] `tests/audit.log.test.ts`: failing (exit 3) and throwing dangerous runs record `started` then `error` with the exit code; the throw propagates; registry reset after each test (REQ-plugins-095)
- [x] `tests/store.scrub.test.ts`: `SCRUB_TARGETS` lists, and a rules bump re-scrubs, every REQ-discord-066 text column (REQ-discord-066)
- [x] `tests/discord.status-audit.test.ts`: bridge start log and `/status` audit line from the real DB and key; tamper after start and missing key (REQ-discord-095); file listed in `discord.spec.md`
- [x] Mutation proof against main (each mutation caught by the new tests, missed by main's suite), sources restored; the new tests pass on unmutated main, so no code fix
- [x] Deltas modify REQ-plugins-095, REQ-discord-066, REQ-discord-095; context, requirements, design, plan, docs, testing filled
- [x] `specsync check --require-coverage 100`, `specsync change audit`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green

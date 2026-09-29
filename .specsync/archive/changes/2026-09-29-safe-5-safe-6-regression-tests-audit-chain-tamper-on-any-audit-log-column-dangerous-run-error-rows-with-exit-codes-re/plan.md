---
change: safe-5-safe-6-regression-tests-audit-chain-tamper-on-any-audit-log-column-dangerous-run-error-rows-with-exit-codes-re
artifact: plan
---

# Plan

1. Re-check each audit finding on current main (`0f2e2c2`): the cited tests
   and code lines are unchanged.
2. Add the tamper table and the error-row test to `tests/audit.log.test.ts`,
   the column coverage describe to `tests/store.scrub.test.ts`, and the new
   `tests/discord.status-audit.test.ts` (listed in `discord.spec.md`).
3. Mutation proof in a scratch worktree of main: apply each mutation to the
   source, run main's related tests (and main's full suite for the four audit
   mutations plus the cached-line variant), run the new tests, restore with
   `git checkout`; the new tests also run on unmutated main (all pass, so no
   code fix is needed).
4. Deltas modify REQ-plugins-095, REQ-discord-066 and REQ-discord-095.
5. `specsync change approve` / `check --commit` / `audit`,
   `specsync check --require-coverage 100`, `hi check`,
   `bunx tsc --noEmit`, `bun test`,
   `fledge lanes run verify --non-interactive`.

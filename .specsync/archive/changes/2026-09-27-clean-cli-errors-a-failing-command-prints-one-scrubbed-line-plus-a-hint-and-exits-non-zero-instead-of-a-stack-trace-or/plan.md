---
change: clean-cli-errors-a-failing-command-prints-one-scrubbed-line-plus-a-hint-and-exits-non-zero-instead-of-a-stack-trace-or
artifact: plan
---

# Plan

1. Re-verify defects 6a–f on current origin/main (all six reproduced).
2. Write the regression tests first (`tests/cli.clean-errors.test.ts` with the
   `tests/fixtures/fake-http-401.ts` preload, `tests/discord.login-failure.test.ts`,
   `tests/watch.auth-stop.test.ts`, `formatErrorLine` cases in
   `tests/store.scrub.test.ts`) and show they fail on main.
3. Add `formatErrorLine`; the CLI boundary (`runCli`, `reportCliError`,
   `cliErrorHint`), the `pluginsRun` catch and the register-commands line;
   the bridge login wrap; the watch 401 halt, `fatal` and one-line sink.
4. Deltas: Added REQ-cli-419, REQ-discord-417, REQ-watch-418; spec files,
   Public API, Invariants and Error Cases updated.
5. `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test`,
   `fledge lanes run verify --non-interactive`.

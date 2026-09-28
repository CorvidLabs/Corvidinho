---
change: clean-cli-errors-a-failing-command-prints-one-scrubbed-line-plus-a-hint-and-exits-non-zero-instead-of-a-stack-trace-or
artifact: tasks
---

# Tasks

- [x] Re-verify defects 6a–f on current origin/main (none already fixed).
- [x] `formatErrorLine` / `ERROR_LINE_MAX` in `src/store/scrub.ts` (scrubbed, env secrets redacted, first line, capped, never throws).
- [x] CLI: `runCli` top-level boundary, `reportCliError`, `cliErrorHint`; `pluginsRun` catches unknown names and throwing handlers (text and `--json`).
- [x] CLI: `discord register-commands` failure is one line with the HTTP status.
- [x] Discord: `gateway.start()` wrapped; clean `discord login failed (401/403): check DISCORD_TOKEN` result, half-started client stopped.
- [x] Watch: GitHub 401 halts the loop and settles `fatal` (exit 1); default error sink prints one scrubbed line; 403 rate-limit backoff unchanged; `github watch` exits with `fatal.exitCode`.
- [x] Regression tests fail before the fix and pass after.
- [x] Deltas and spec files updated.
- [x] Review follow-up: SQLite DB-open errors get the data-dir hint; slash registration on bridge ready is one line via `formatRegisterCommandsFailure` (shared with `register-commands`); login failure redacts with the bridge env; `github watch` exits with the fatal code even if `stop()` rejects; `docs/WATCH.md` documents the 401 stop.

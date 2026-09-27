---
change: clean-cli-errors-a-failing-command-prints-one-scrubbed-line-plus-a-hint-and-exits-non-zero-instead-of-a-stack-trace-or
artifact: docs
---

# Docs

`specs/cli/cli.spec.md`, `specs/discord/discord.spec.md` and
`specs/watch/watch.spec.md`: new files listed; Public API gains `runCli`,
`reportCliError`, `cliErrorHint`, `formatErrorLine` / `ERROR_LINE_MAX`,
`formatDiscordLoginFailure`, `formatRegisterCommandsFailure`,
`StartWatchResult.fatal` / `WatchFatal`;
Invariants and Error Cases describe the one-line errors, the login failure
and the 401 stop. TSDoc on each export. `docs/WATCH.md` Reliability gains a GitHub 401 bullet
(watch stops, one line, exit 1; other poll errors one scrubbed line); its 403
rate-limit text is unchanged. No CLI flag, env var or command change.

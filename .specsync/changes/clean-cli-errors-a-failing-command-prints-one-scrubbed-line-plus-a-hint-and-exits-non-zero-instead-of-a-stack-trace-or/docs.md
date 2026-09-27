---
change: clean-cli-errors-a-failing-command-prints-one-scrubbed-line-plus-a-hint-and-exits-non-zero-instead-of-a-stack-trace-or
artifact: docs
---

# Docs

`specs/cli/cli.spec.md`, `specs/discord/discord.spec.md` and
`specs/watch/watch.spec.md`: new files listed; Public API gains `runCli`,
`reportCliError`, `cliErrorHint`, `formatErrorLine` / `ERROR_LINE_MAX`,
`formatDiscordLoginFailure`, `StartWatchResult.fatal` / `WatchFatal`;
Invariants and Error Cases describe the one-line errors, the login failure
and the 401 stop. TSDoc on each export. No user-facing doc, CLI flag, env var
or command change; `docs/WATCH.md` behaviour for 403 rate limits is unchanged.

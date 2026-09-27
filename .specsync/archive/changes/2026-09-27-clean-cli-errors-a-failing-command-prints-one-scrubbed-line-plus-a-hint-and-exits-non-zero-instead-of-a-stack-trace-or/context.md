---
change: clean-cli-errors-a-failing-command-prints-one-scrubbed-line-plus-a-hint-and-exits-non-zero-instead-of-a-stack-trace-or
artifact: context
---

# Context

Defect 6 (a–f) of the CLI end-to-end check on origin/main 76d1023 (v0.0.24):
several commands crash with a raw stack trace, a code frame and Bun's crash
footer, or dump a whole library error object, instead of telling the operator
in plain language what is wrong (CLI-4). Re-verified on origin/main bf9a5b2
(v0.0.26) before the fix; all six still reproduced, none was already fixed:

- a. `plugins run nosuchplugin` (also `fledge-nosuch`, also `--json`):
  uncaught `PluginNotFoundError` thrown by `runPlugin`
  (`src/plugins/run.ts`); `pluginsRun` in `src/cli.ts` did not catch it.
- b. `CORVIDINHO_DATA_DIR=/proc/nope CORVIDINHO_ACTING_DISCORD_USER_ID=1
  plugins run memory-recall`: ENOENT stack from `openCorvidinhoDb`
  (`src/store/db.ts`) plus crash footer. Any throwing plugin handler did this.
- c. The same ENOENT crash from `discord bridge` (`startBridge` opens the DB).
- d. `DISCORD_TOKEN=garbage DISCORD_CHANNEL_IDS=1 discord bridge`: uncaught
  `DiscordAPIError` (sandbox egress 403) or, for a real bad token, discord.js
  `TokenInvalid` (it maps the 401 from `GET /gateway/bot`), because
  `await gateway.start()` in `src/discord/bridge.ts` was not wrapped.
- e. `discord register-commands` with a fake token printed
  `console.error("[discord] register-commands failed:", err)`: the raw
  `DiscordAPIError` with its `rawError` byte array, request body and a
  library code frame.
- f. `github watch` with a bad token printed a full Octokit `HttpError`
  every poll (the default `logError` passed the error object to
  `console.error`) and kept polling forever on 401.

No token value was printed in these dumps, but nothing guaranteed it either.

Constraints: HI-first (CLI-4, CLI-7, SAFE-6, WATCH-RELIABILITY-3); no new env
var, flag, command or product surface; keep existing exit codes (a missing
plugin stays 1, a SAFE-1 denial stays 2) and the `plugins run --json` error
shape; the 403 rate-limit backoff (WATCH-RELIABILITY-3) is unchanged; no global
`unhandledRejection` handler (REQ-discord-331). Regression tests must run with
no network and no real token: CLI subprocess tests preload
`tests/fixtures/fake-http-401.ts`, which answers every Discord / GitHub
request with 401 the way a bad token does.

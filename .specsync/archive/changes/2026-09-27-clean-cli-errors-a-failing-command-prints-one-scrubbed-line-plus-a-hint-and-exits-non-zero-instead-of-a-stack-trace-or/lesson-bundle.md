# Lesson bundle — clean-cli-errors-a-failing-command-prints-one-scrubbed-line-plus-a-hint-and-exits-non-zero-instead-of-a-stack-trace-or

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Clean CLI errors: a failing command prints one scrubbed line plus a hint and exits non-zero instead of a stack trace or Bun crash footer; discord bridge login failure exits cleanly naming DISCORD_TOKEN; github watch stops with exit 1 on a GitHub 401
- **Kind**: BugFix
- **Specs**: cli, discord, watch
- **Paths**: src/cli.ts, src/store/scrub.ts, src/discord/bridge.ts, src/watch/poller.ts, src/watch/index.ts, tests/cli.clean-errors.test.ts, tests/discord.login-failure.test.ts, tests/watch.auth-stop.test.ts, tests/store.scrub.test.ts, tests/fixtures/fake-http-401.ts, specs/cli/cli.spec.md, specs/discord/discord.spec.md, specs/watch/watch.spec.md, src/discord/gateway.ts, src/discord/register-commands.ts, src/discord/index.ts, docs/WATCH.md
- **Acceptance**: plugins run with an unknown name (also fledge-*), a plugin handler that throws, discord bridge with an unusable data dir, and anything else main throws print one SAFE-6 scrubbed line plus a hint and exit non-zero (the error's own exitCode or 1), with no stack frame, code frame, Bun crash footer, library object dump or token value; --json keeps the {ok:false,error} shape on stdout; discord bridge whose gateway login is rejected exits 1 with 'discord login failed (401|403): check DISCORD_TOKEN'; discord register-commands failure is one line with the HTTP status; github watch stops with exit 1 and one clear line on a GitHub 401 instead of polling forever, other poll errors print one scrubbed line, and a 403 rate-limit still backs off (WATCH-RELIABILITY-3)

## Evidence

- Verification commit: `d389666cb5ca05cabb03c3a4792aafecf0126512`
- Base commit: `bf9a5b20b2a13f77eb503567428ff5551321bc9c`
- Verified by: `specsync check --spec cli --spec discord --spec watch`

## From the change's context.md

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

## From the change's design.md

# Design

- `formatErrorLine(err, { env?, max? })` in `src/store/scrub.ts` (SAFE-6
  home): message only (TypeError/RangeError/ReferenceError/SyntaxError keep
  their class name; library names such as `DiscordAPIError[0]` are dropped),
  literal values of `DISCORD_TOKEN`, `DISCORD_BOT_TOKEN`, `GITHUB_TOKEN`,
  `GH_TOKEN`, `CORVIDINHO_LLM_API_KEY`, `OPENAI_API_KEY`,
  `CORVIDINHO_AUDIT_HMAC_KEY` (8+ chars) replaced by
  `[redacted:env-secret]`, `scrubSecrets`, first line only, capped at
  `ERROR_LINE_MAX` (300). It never throws (`(unprintable error)`).
- CLI (`src/cli.ts`): `reportCliError(err, { json })` prints
  `corvidinho: <line>` + `hint: <hint>` on stderr, or in JSON mode
  `{ "ok": false, "error": <line> }` on stdout (same shape as the existing
  `plugins run --json` error) with the hint on stderr; returns the error's
  integer `exitCode` in 1..255 or 1. `cliErrorHint`: unknown plugin →
  `corvidinho plugins list`; filesystem error with a `path` → check the path,
  data dir is `CORVIDINHO_DATA_DIR` (default `~/.local/share/corvidinho`);
  else → `corvidinho doctor`. `runCli(argv, run = main)` is the top-level
  boundary used by `import.meta.main`; JSON mode when argv (before `--`)
  has `--json` or `--output json`. `pluginsRun` catches `runPlugin` throws
  and reports them the same way. `discord register-commands` prints one line
  with the HTTP status and a token hint on 401/403. `github watch` resolves
  with `result.fatal.exitCode` after calling `stop()`.
- Discord (`src/discord/bridge.ts`): `await gateway.start()` is wrapped; on a
  throw the half-started client is stopped (scheduler not started yet) and
  `startBridge` returns `{ ok: false, exitCode: 1, message:
  formatDiscordLoginFailure(err) }`, which the CLI already prints and exits
  with. `TokenInvalid` counts as 401; 401/403 →
  `discord login failed (<status>): check DISCORD_TOKEN (<line>)`; else
  `discord login failed: <line> — check DISCORD_TOKEN and that discord.com is
  reachable`.
- Watch (`src/watch/poller.ts`): the loop's catch checks a 401 first:
  `running = false`, timer cleared, one `logError` line
  `[watch] github auth failed (401): <line> — check GITHUB_TOKEN / GH_TOKEN;
  watch stopped`, and `fatal` (new on `StartWatchResult`) settles with
  `{ exitCode: 1, message }`. `pollOnce()` still throws for direct callers.
  A 403/429 rate limit keeps its backoff; any other error keeps polling at the
  interval. The default `logError` prints `<msg>: <formatErrorLine(err)>`
  instead of passing the error object to `console.error`.
- Not changed: `runPlugin`, exit codes of `ok: false` plugin results, NDJSON
  frames, no global `unhandledRejection` handler, no new env var/flag/command.

## From the change's testing.md

# Testing

Every new test was run against the unfixed source (`git stash` of `src/`):
the 9 CLI subprocess repros failed on behaviour (stack frames, code frames,
`Bun v1.4.2 (Linux x64)` footer, raw `DiscordAPIError` / `TokenInvalid`
dumps, and `github watch` still polling when killed), the 3 watch tests
failed (`fatal` missing, error object passed to the sink), and the unit
files failed to load (`reportCliError`, `formatDiscordLoginFailure`,
`ERROR_LINE_MAX` not exported). All pass after the fix. Subprocess tests use
a temp HOME / data dir / missing allowlist file and fake tokens assembled at
runtime; the Discord and GitHub cases preload
`tests/fixtures/fake-http-401.ts` (401 for every Discord / GitHub request),
so no network or real token is used. Each asserts no `at …` stack frame, no
`NN | ` code frame, no `Bun v` footer, no `node_modules`, no
`rawError` / `requestBody` and no token value in stdout + stderr.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-419` | `tests/cli.clean-errors.test.ts` | `plugins run nosuchplugin` and `fledge-nosuch`: exit 1, `corvidinho: Unknown plugin command: …` + `corvidinho plugins list` hint; `--json`: stdout parses to `{ok:false,error:"Unknown plugin command: nosuchplugin"}`, exit 1 (defect 6a). |
| `REQ-cli-419` | `tests/cli.clean-errors.test.ts` | `CORVIDINHO_DATA_DIR=/proc/nope … plugins run memory-recall` (text and `--json`): exactly two stderr lines (error + `CORVIDINHO_DATA_DIR` hint) or `{ok:false,error}` naming `/proc/nope`, exit 1 (6b). |
| `REQ-cli-419` | `tests/cli.clean-errors.test.ts` | `discord bridge` with `CORVIDINHO_DATA_DIR=/proc/nope`: `corvidinho: ENOENT … '/proc/nope'` + data-dir hint, exit 1, token absent (6c). |
| `REQ-cli-419` | `tests/cli.clean-errors.test.ts` | `discord register-commands --guild-id 1` with a 401: one stderr line `[discord] register-commands failed (401): … DISCORD_TOKEN …`, exit 1, token absent (6e). |
| `REQ-cli-419` | `tests/cli.clean-errors.test.ts` | `github watch` with a 401: exits 1 on its own (not killed) with `github auth failed (401)` naming `GITHUB_TOKEN`, no `HttpError`, token absent (6f, CLI side). |
| `REQ-cli-419` | `tests/cli.clean-errors.test.ts` | `reportCliError`: text mode two stderr lines, vendor token scrubbed, `exitCode` 2 kept; JSON mode `{ok:false,error}` on stdout, hint on stderr, exit 1; a non-vendor secret env value redacted. `runCli` with a throwing `main`: exit 3 kept, text and `--output json` shapes, data-dir hint; clean exit codes 0/2 pass through. |
| `REQ-discord-417` | `tests/cli.clean-errors.test.ts` | `discord bridge` with a 401 (discord.js `TokenInvalid`): `discord login failed (401): check DISCORD_TOKEN`, exit 1, not killed, token absent (6d). |
| `REQ-discord-417` | `tests/discord.login-failure.test.ts` | `startBridge` with a gateway whose `start()` throws `TokenInvalid` → `{ok:false, exitCode:1}` and the exact 401 message, gateway `stop()` called once; `DiscordAPIError` 403 → `(403): check DISCORD_TOKEN`, one line, no `rawError`; network error → reachability wording, first line only; a token value inside the error text is not echoed. |
| `REQ-discord-417` | `tests/store.scrub.test.ts` | `formatErrorLine`: first line only; GitHub token and a multi-line private-key block redacted; secret env value (8+ chars) redacted, 3-char value kept; `TypeError:` prefix kept, `DiscordAPIError[0]` name dropped; string / `{message}` / number / empty / whitespace / null-prototype inputs; capped at `ERROR_LINE_MAX` with `…`. |
| `REQ-watch-418` | `tests/watch.auth-stop.test.ts` | Poll that throws an Octokit-shaped 401: `fatal` settles `{exitCode:1}` with the exact `[watch] github auth failed (401): … — check GITHUB_TOKEN / GH_TOKEN; watch stopped` line, the sink got that one line and no error object, token absent, a later `pollOnce()` fetches nothing (loop halted); default sink with a 500 prints exactly one string `[watch] pollOnce error: Server Error for [redacted:env-secret]`; a 403 rate limit (`retry-after: 120`) still backs off ~120 s and `fatal` stays unsettled (WATCH-RELIABILITY-3). |
| `REQ-cli-419` | `tests/cli.clean-errors.test.ts` | Review follow-up: a data dir whose `corvidinho.db` is a directory (`SQLITE_CANTOPEN`) makes `plugins run memory-recall` exit 1 with exactly two stderr lines and the `CORVIDINHO_DATA_DIR` hint (was the `corvidinho doctor` hint); `cliErrorHint` unit cases: real bun:sqlite `SQLITE_CANTOPEN` and `EACCES`+path give the data-dir hint, `SQLITE_BUSY`, a path-less `ENOENT`, a plain error and `null` give `corvidinho doctor`. Both fail with the SQLite clause removed. |
| `REQ-discord-417` | `tests/discord.login-failure.test.ts` | Review follow-up: `formatRegisterCommandsFailure` with the bridge options on a `DiscordAPIError` 403 `Missing Access` gives the exact one-line `slash command registration failed (403) … DISCORD_GUILD_ID` text with no `requestBody` / newline; defaults name `--guild-id` on 401 and give no hint for a status-less error; a secret env value is redacted. A token only in the `startBridge` env is redacted from the login failure message (fails without passing the bridge env). |

## Where these lessons go

- `specs/cli/context.md`
- `specs/discord/context.md`
- `specs/watch/context.md`

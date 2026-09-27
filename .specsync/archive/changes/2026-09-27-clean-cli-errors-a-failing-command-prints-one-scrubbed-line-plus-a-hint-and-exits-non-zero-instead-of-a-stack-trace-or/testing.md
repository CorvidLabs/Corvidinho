---
change: clean-cli-errors-a-failing-command-prints-one-scrubbed-line-plus-a-hint-and-exits-non-zero-instead-of-a-stack-trace-or
artifact: testing
---

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

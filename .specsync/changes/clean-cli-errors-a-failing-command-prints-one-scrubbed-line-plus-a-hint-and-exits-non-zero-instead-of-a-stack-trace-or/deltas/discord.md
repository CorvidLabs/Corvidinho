---
module: discord
change: clean-cli-errors-a-failing-command-prints-one-scrubbed-line-plus-a-hint-and-exits-non-zero-instead-of-a-stack-trace-or
---

# Delta — discord (one scrubbed error line; clean gateway login failure)

## Added

### REQUIREMENT REQ-discord-417

Errors shown to an operator SHALL be one SAFE-6 line, and a rejected Discord
login SHALL end the bridge start cleanly (CLI-4, SAFE-6).

- `formatErrorLine(err, { env?, max? })` in `src/store/scrub.ts` SHALL return
  the error message only (a `TypeError` / `RangeError` / `ReferenceError` /
  `SyntaxError` keeps its class name; other names are dropped), with the
  literal value of each set secret env var from `.env.example`
  (`DISCORD_TOKEN`, `DISCORD_BOT_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN`,
  `CORVIDINHO_LLM_API_KEY`, `OPENAI_API_KEY`, `CORVIDINHO_AUDIT_HMAC_KEY`;
  values of 8+ characters) replaced by `[redacted:env-secret]`, then passed
  through `scrubSecrets`, cut to its first line and capped at
  `ERROR_LINE_MAX` (300) characters. It SHALL NOT throw; an unprintable value
  gives `(unprintable error)`.
- `startBridge` SHALL catch a rejected `gateway.start()`, stop the
  half-started gateway (the schedule ticker is not started yet) and return
  `{ ok: false, exitCode: 1, message }` with
  `message = formatDiscordLoginFailure(err)`: discord.js `TokenInvalid`
  counts as 401; on 401/403 it is
  `discord login failed (<status>): check DISCORD_TOKEN (<line>)`; otherwise
  `discord login failed: <line> — check DISCORD_TOKEN and that discord.com is
  reachable`.

Existing start refusals (missing token, empty channel allowlist) are
unchanged. No new env var, slash command, CLI flag, table or column.

Acceptance Criteria
- `startBridge` whose gateway `start()` throws discord.js `TokenInvalid` returns `{ ok: false, exitCode: 1 }` with `discord login failed (401): check DISCORD_TOKEN (An invalid token was provided.)` and calls the gateway's `stop()` once.
- A `DiscordAPIError` with status 403 gives `discord login failed (403): check DISCORD_TOKEN …` on one line with no `rawError`.
- `corvidinho discord bridge` with a token Discord rejects exits 1 with that line and no stack, crash footer or token value.
- `formatErrorLine` returns only the first line, redacts vendor-key shapes (including a multi-line private-key block) and the value of a set secret env var of 8+ characters, keeps shorter values, keeps the `TypeError:` prefix, drops `DiscordAPIError[0]`, handles strings, `{message}` objects, numbers, empty messages and null-prototype objects, and caps at `ERROR_LINE_MAX`.

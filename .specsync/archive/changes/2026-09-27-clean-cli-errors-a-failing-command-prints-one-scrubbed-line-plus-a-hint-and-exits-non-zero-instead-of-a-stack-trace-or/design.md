---
change: clean-cli-errors-a-failing-command-prints-one-scrubbed-line-plus-a-hint-and-exits-non-zero-instead-of-a-stack-trace-or
artifact: design
---

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

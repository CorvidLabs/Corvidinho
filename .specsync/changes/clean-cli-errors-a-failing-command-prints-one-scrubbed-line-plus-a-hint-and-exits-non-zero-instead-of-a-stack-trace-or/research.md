---
change: clean-cli-errors-a-failing-command-prints-one-scrubbed-line-plus-a-hint-and-exits-non-zero-instead-of-a-stack-trace-or
artifact: research
---

# Research

- `src/cli.ts` ran `process.exit(await main(process.argv))` with no catch,
  so any throw from a command handler became Bun's uncaught-error report
  (code frame, stack, `Bun vX (Linux x64)` footer) and exit 1.
- `runPlugin` throws `PluginNotFoundError` (`exitCode = 1`) for an unknown
  name and re-throws a handler's error after auditing it; the agent loop
  catches those itself, only the CLI did not.
- discord.js 14 `WebSocketManager.connect` turns a 401 from
  `GET /gateway/bot` into `DiscordjsError` with `code: "TokenInvalid"` and
  no `status`; other REST failures are `DiscordAPIError` with `status`
  (its `name` is `DiscordAPIError[<code>]`).
- `@discordjs/rest` picks `fetch` as its request strategy when it loads under
  Bun, and `@octokit/request` reads `globalThis.fetch` per call, so a
  `bun --preload` file that replaces `fetch` drives both failure paths
  end to end without network.
- Octokit `RequestError` carries `status` (and `response.status`); its
  `request.headers.authorization` is redacted by Octokit but the whole object
  was still printed. `parseGithubRateLimit` already ignores a bare 403 and
  handles 403/429 rate limits (WATCH-RELIABILITY-3).
- `scrubSecrets` (SAFE-6) redacts vendor-key shapes but not a mistyped token
  such as `garbage`, so the error line also redacts the literal values of the
  secret env vars listed in `.env.example` (8+ chars, to avoid redacting
  ordinary words).

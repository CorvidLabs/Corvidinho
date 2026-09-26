---
change: allowlist-file-toml-reader-loads-multi-line-arrays-and-fails-closed-on-anything-it-cannot-parse-so-file-deny-lists-are
artifact: research
---

# Research

- Callers of `loadAllowlist` and how they handle a throw today:
  - `loadWatchConfig`: try/catch, returns `code: "allowlist"`, and WATCH does not start.
  - `startDaemon`: the loader runs inside the start try, so a throw means `daemon.start_failed`.
  - `resolveActingIsAdmin` (roles.ts): catch, returns `false` (not ADMIN).
  - `git-push` / `discord-post-message`: the handler throw propagates out of `runPlugin`. The tool loop turns it into an exit-1 tool error, the CLI exits non-zero, and nothing is pushed or posted.
  - `loadBridgeConfig`: had no catch. Its `ConfigError` union already had an unused `"allowlist"` code, so the same wrapper as WATCH fits.
  - PR #191's `checkRepoGateForActingRole` awaits `loadAllowlist`, so a throw refuses the plugin call.
- Treating a broken file as "no file" is not safe, because the env overlays merge afterwards (`mergeGithub` / `mergeDiscord`). An env `CORVIDINHO_GITHUB_ALLOW_ORGS` would admit a repo the file denies. Throwing is the only option that cannot turn a deny into an allow, and every caller already refuses on a throw.
- `parseSimpleToml` has two other users. `readFileAdminList` (/admin) already wraps parse errors as "could not be parsed" and refuses to write. `identity/owner.ts` reads `[owner]` with its own parser, so `[owner]` keeps the lenient reading.
- `setTomlDiscordList` (the /admin writer) already collapses a multi-line `<key> = [` … `]` into one line. On main the reader returned `[]` for that key, so `/admin users add` on a multi-line `users` list wrote back only the new id and dropped the operator's entries. With the reader fixed, the round trip keeps every entry.
- `Bun.TOML.parse` was not used. It rejects bare words (`[a, b]`, `key = a b`) that the current reader accepts, turns unquoted snowflakes into lossy numbers, and rejects repeated tables. Any of those would change how existing single-line files load.

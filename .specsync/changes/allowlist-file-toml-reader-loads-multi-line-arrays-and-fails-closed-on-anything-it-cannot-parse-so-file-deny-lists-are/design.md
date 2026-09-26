---
change: allowlist-file-toml-reader-loads-multi-line-arrays-and-fails-closed-on-anything-it-cannot-parse-so-file-deny-lists-are
artifact: design
---

# Design

- `parseSimpleToml` keeps its signature. It now walks the file with a row index:
  - Header lines must match `[name]` (letters, digits, `_`, `.`, `-`; spaces around the name allowed). Anything else that starts with `[` throws in every section. This covers `[github`, `[[github]]` and `["github"]`, each of which used to leave the following keys in the previous section.
  - In `[github]`, `[discord]` and the top level, a line must be `key = value` with a bare key (`[A-Za-z0-9_]+`). A value starting with `[` is scanned as an array that may span lines. Items are quoted strings (`"…"` with only `\"` / `\\` escapes, or `'…'`) or bare words. A trailing comma and `#` comments between items are allowed. Leading or double commas, missing commas, nested arrays, text after `]`, an unterminated string, or reaching EOF, a `[header]` or a `key =` line before `]` all throw. A quoted item that holds commas is split on them, as the single-line reader always did, so `["a/x, a/y"]` still denies both.
  - Any other value is a one-line quoted or bare list, split on commas and whitespace as before. An empty value, text after the closing quote, or stray quotes, brackets or `=` throw.
  - Other sections (`[owner]` and unknown ones) keep the old lenient one-line reading, because identity/owner.ts parses `[owner]` itself and its display names may hold any text.
  - Errors read `allowlist TOML line N: [section].key: <problem>` and never include values.
- `loadAllowlistFile` still returns `{ ok: false, error }`. `loadAllowlist` now throws when a file that exists fails to load (TOML or JSON). It used to drop the file silently and merge the env overlays. A missing file (or `filePath: null`) is unchanged: env overlays only.
- `loadBridgeConfig` catches the throw and returns `code: "allowlist"`, as `loadWatchConfig` already does. The daemon, roles.ts, `git-push`, `discord-post-message` and #191's gate already refuse on a throw.
- /admin needs no code change. With the reader fixed, `readFileAdminList` sees every multi-line entry, and `setTomlDiscordList` (already multi-line aware) writes them back on one line. A file the reader rejects is refused with "could not be parsed" and is not rewritten.
- No new env var, config key, slash command or plugin.

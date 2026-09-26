---
change: allowlist-file-toml-reader-loads-multi-line-arrays-and-fails-closed-on-anything-it-cannot-parse-so-file-deny-lists-are
artifact: design
---

# Design

- `parseSimpleToml` keeps its signature. It now walks the file with a row index:
  - Header lines `[name]` (letters, digits, `_`, `.`, `-`; spaces around the name allowed) open that section. Another balanced one- or two-bracket header (`[my notes]`, `[[rules]]`, `['x']`) opens an unrelated lenient section, unless its name mentions github or discord (`[[github]]`, `["discord"]`), holds `,` or `=` (a stray array line), or is unbalanced (`[github`, `[[rules]`): those throw. The github/discord forms used to leave the following keys in the previous section.
  - A `deny…` key (any spelling) at the top level or in any section other than `[github]` / `[discord]` throws: the loader would ignore it, so a deny list could be dropped by a misplaced header.
  - Any Unicode whitespace separates tokens, so a pasted U+00A0 does not stop the bot.
  - In `[github]`, `[discord]` and the top level, a line must be `key = value` with a bare key (`[A-Za-z0-9_]+`). A value starting with `[` is scanned as an array that may span lines. Items are quoted strings (`"…"` with only `\"` / `\\` escapes, or `'…'`) or bare words. A trailing comma and `#` comments between items are allowed. Leading or double commas, missing commas, nested arrays, text after `]`, an unterminated string, or reaching EOF, a `[header]` or a `key =` line before `]` all throw. A quoted item that holds commas is split on them, as the single-line reader always did, so `["a/x, a/y"]` still denies both.
  - Any other value is a one-line quoted or bare list, split on commas and whitespace as before. An empty value, text after the closing quote, or stray quotes, brackets or `=` throw.
  - Other sections (`[owner]` and unknown ones) keep the old lenient one-line reading, because identity/owner.ts parses `[owner]` itself and its display names may hold any text.
  - Errors read `allowlist TOML line N: [section].key: <problem>` and never include values.
- `loadAllowlistFile` still returns `{ ok: false, error }`. `loadAllowlist` now throws when a file that exists fails to load (TOML or JSON). It used to drop the file silently and merge the env overlays. A missing file (or `filePath: null`) is unchanged: env overlays only.
- The reader is `scanSimpleToml`, which also returns each key's first and last row; `parseSimpleToml` is built on it. `parseAllowlistText(text, path)` is the loader's view of file text (JSON or TOML); `loadAllowlistFile` uses it.
- `loadBridgeConfig` catches the throw and returns `code: "allowlist"`, as `loadWatchConfig` already does. The daemon's start and roles.ts already refuse on a throw.
- Action gates use `tryLoadAllowlist`, which returns `{ ok: false, error }` instead of throwing: `checkRepoGateAsync` and `checkRepoGateForActingRole` (#191's GitHub gate, now on main) return `GITHUB-6: refused — <loader error>` (exit 3 in the plugins), `git-push` returns the same with exit 3, and `discord-post-message` returns `not authorized: <loader error>` with exit 3. No stack traces reach the CLI or the agent.
- `corvidinho doctor` adds an `allowlist-file` check: `[fail]` with the loader's error for a file that does not load, `[ok]` when it loads, `[info]` when there is none.
- /admin: `setTomlDiscordList` now locates lines with `scanSimpleToml`, so a new key goes after the closing `]` of the last value in the first `[discord]` (it used to land inside a multi-line array and break the file), and quoted `]` / `#` are handled. `planAdminListChange` re-reads the rewrite with `parseAllowlistText` and `parseSimpleToml` and refuses, writing nothing, unless it loads, the edited list reads back as `fileAfter` and every other list and key is unchanged. A file the reader rejects is still refused with "could not be parsed".
- No new env var, config key, slash command or plugin.

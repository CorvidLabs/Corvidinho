---
change: allowlist-file-toml-reader-loads-multi-line-arrays-and-fails-closed-on-anything-it-cannot-parse-so-file-deny-lists-are
artifact: requirements
---

# Requirements

The allowlist file loads from config on the bot VM (ALLOW-4). Deny lists must hold: GITHUB-6 (repos it will not touch), ALLOW-1/2/5 (GitHub allowlists; a denied contact is refused), ALLOW-3 and DISCORD-5 (Discord channels, users and roles), and ALLOW-6 (widening is an explicit config change, never a parse accident). ADMIN-1/2: /admin edits the same file.

- Modified **REQ-plugins-006**: the TOML subset now covers multi-line arrays, with a trailing comma and `#` comments. Single-line allow/deny lists read as before; any Unicode whitespace separates tokens. Anything the reader cannot parse in `[github]`, `[discord]` or the top level is a load error, as are github/discord headers in unsupported forms and `deny…` keys outside those sections; other sections, loose headers included, stay lenient. Action gates refuse (exit 3) instead of throwing, and `corvidinho doctor` reports the error. A file that exists but cannot be read or parsed makes `loadAllowlist` throw and never falls back to env-only. A missing file still means env only.
- Modified **REQ-discord-004**: the bridge returns `code: "allowlist"` and does not start on a malformed file. Multi-line `[discord]` lists load in full, and /admin (REQ-discord-043) round-trips multi-line lists; it places new keys after any multi-line array and re-reads every rewrite before writing, refusing one that would not reload as intended.
- Modified **REQ-plugins-253** (from main, #191): a malformed or unreadable allowlist file now makes the GitHub gate refuse (exit 3, GITHUB-6 error naming the file problem) instead of contributing nothing while env allow still applies.
- Modified **REQ-cli-042**: `corvidinho doctor` adds an `allowlist-file` line — `[fail]` with the loader's error when the file does not load, `[ok]` when it does, `[info]` when there is none.

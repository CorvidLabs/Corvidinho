---
change: allowlist-file-toml-reader-loads-multi-line-arrays-and-fails-closed-on-anything-it-cannot-parse-so-file-deny-lists-are
artifact: requirements
---

# Requirements

The allowlist file loads from config on the bot VM (ALLOW-4). Deny lists must hold: GITHUB-6 (repos it will not touch), ALLOW-1/2/5 (GitHub allowlists; a denied contact is refused), ALLOW-3 and DISCORD-5 (Discord channels, users and roles), and ALLOW-6 (widening is an explicit config change, never a parse accident). ADMIN-1/2: /admin edits the same file.

- Modified **REQ-plugins-006**: the TOML subset now covers multi-line arrays, with a trailing comma and `#` comments. Single-line files read exactly as before. Anything the reader cannot parse in `[github]`, `[discord]` or the top level is a load error. A file that exists but cannot be read or parsed makes `loadAllowlist` throw and never falls back to env-only. A missing file still means env only.
- Modified **REQ-discord-004**: the bridge returns `code: "allowlist"` and does not start on a malformed file. Multi-line `[discord]` lists load in full, and /admin (REQ-discord-043) round-trips multi-line lists.

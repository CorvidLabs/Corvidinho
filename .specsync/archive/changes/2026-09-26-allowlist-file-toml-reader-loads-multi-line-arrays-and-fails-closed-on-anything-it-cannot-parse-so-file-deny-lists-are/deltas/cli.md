---
module: cli
change: allowlist-file-toml-reader-loads-multi-line-arrays-and-fails-closed-on-anything-it-cannot-parse-so-file-deny-lists-are
---

# Delta — cli (doctor reports an allowlist file that does not load)

## Modified

### REQUIREMENT REQ-cli-042

`corvidinho doctor` SHALL report whether a durable owner is configured
(IDENTITY-1, CLI-4) from the same env and allowlist file the Discord bridge
reads (`CORVIDINHO_OWNER_*` env, allowlist `[owner]` section). The line SHALL
show "configured: yes" plus the display name when set, or "configured: no"
with a plain-language hint. It SHALL never print the owner's Discord id,
GitHub login, or any token. Owner config problems (for example a non-snowflake
Discord id) SHALL be named without echoing the value. A missing owner is
informational and SHALL NOT change the doctor exit code.

Because ADMIN is owner-only (IDENTITY-2), doctor SHALL print a
`[warn] admin-lists` line when `CORVIDINHO_DISCORD_ADMIN_USERS` or
`CORVIDINHO_DISCORD_ADMIN_ROLES` is set, saying they are ignored. The line
SHALL NOT echo their values and SHALL NOT change the exit code.

Doctor SHALL print an `allowlist-file` line for the file the loader resolves
(ALLOW-4, REQ-plugins-006). A file that exists but cannot be read or parsed
SHALL be a failing `[fail]` check that shows the loader's error (path, line
and key, never list values), since the bridge, watch and daemon refuse to
start on it. A file that loads SHALL show `[ok]`, and no file SHALL show
`[info]` (env overlays only) without changing the exit code.

Acceptance Criteria
- Doctor prints an `owner` line with configured yes/no plus the display name only.
- Doctor never prints the owner Discord id, GitHub login, or tokens.
- A missing owner does not flip the doctor exit code.
- Legacy admin lists produce a `[warn] admin-lists` line without their values and without changing the exit code.
- Fixture test runs doctor with a temp allowlist file / env (no network).
- A malformed allowlist file gives `[fail] allowlist-file` with the line and key and without the values; a file that loads gives `[ok]`; no file gives `[info]`.

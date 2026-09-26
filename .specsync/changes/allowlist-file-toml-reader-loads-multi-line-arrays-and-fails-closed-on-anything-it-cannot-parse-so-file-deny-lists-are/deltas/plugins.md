---
module: plugins
change: allowlist-file-toml-reader-loads-multi-line-arrays-and-fails-closed-on-anything-it-cannot-parse-so-file-deny-lists-are
---

# Delta — plugins (allowlist file: multi-line TOML arrays, fail closed)

## Modified

### REQUIREMENT REQ-plugins-006

Allowlists SHALL load from bot-VM config file (`CORVIDINHO_ALLOWLIST_FILE` or `~/.config/corvidinho/allowlist.toml|json`) with env overlays (ALLOW-4). Secrets stay in env.

The TOML file SHALL be read as a minimal subset: `[section]` headers and
`key = value`, where a value is an array of quoted strings or bare words that
MAY span lines, with a trailing comma and `#` comments between items, or a
one-line `"a,b"` / `a b` list. Single-line files SHALL read exactly as
before. In `[github]`, `[discord]` and the top level, any line or value
outside that subset (unterminated or malformed array or string, unsupported
key, header or escape), and a malformed `[header]` anywhere, SHALL be a load
error that names the line and key but no values. A file that exists but
cannot be read or parsed (TOML or JSON) SHALL make `loadAllowlist` throw
instead of falling back to env overlays alone, so a deny list in the file can
never be dropped while an env allow admits the target (fail closed; GITHUB-6,
ALLOW-1..6). A missing file SHALL still mean env overlays only.

Acceptance Criteria
- File path env and default home config paths are consulted.
- Env overlays (e.g. `CORVIDINHO_GITHUB_ALLOW_REPOS`) merge over file.
- `orgs` / `repos` / `deny_repos` / `deny_orgs` arrays spanning lines (trailing comma, `#` comments) load every item; a multi-line file `deny_repos` refuses the repo at the gate and in `git-push` (exit 3) while an env allow admits its org.
- Single-line files parse to the same result as the previous reader (corpus includes `allowlist.example.toml`).
- An unterminated or malformed array or string, a bad key or a bad header in an allow/deny section throws; `loadAllowlist` rejects for a malformed TOML or JSON file, and `git-push` pushes nothing.

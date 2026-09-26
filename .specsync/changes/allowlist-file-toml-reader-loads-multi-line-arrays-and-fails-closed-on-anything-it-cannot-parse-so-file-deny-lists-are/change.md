---
id: allowlist-file-toml-reader-loads-multi-line-arrays-and-fails-closed-on-anything-it-cannot-parse-so-file-deny-lists-are
state: implementing
type: bug_fix
base_commit: e8bbd215036e7dc8739ac9159afa19f17ae943c6
---

# Allowlist file TOML reader loads multi-line arrays and fails closed on anything it cannot parse, so file deny lists are never silently dropped

## Intent

Allowlist file TOML reader loads multi-line arrays and fails closed on anything it cannot parse, so file deny lists are never silently dropped

## Affected Canonical Specs

- `plugins`
- `discord`
- `cli`

## Acceptance Criteria

- A multi-line [github]/[discord] array in the allowlist TOML file (trailing comma and # comments allowed) loads every item, so a file deny_repos/deny_orgs spanning lines refuses the repo even when env allow admits its org (GITHUB-6); single-line files parse exactly as before; any line or value in [github]/[discord]/top level the parser cannot read (unterminated or malformed array/string, bad key or header) throws, loadAllowlist throws instead of falling back to env-only for any file that exists but cannot be read or parsed, and the bridge (code allowlist), watch, daemon, git-push and the repo gates refuse; /admin reads multi-line users/channels and its rewrite reloads with every entry and deny list intact

## No-spec Rationale

Not applicable

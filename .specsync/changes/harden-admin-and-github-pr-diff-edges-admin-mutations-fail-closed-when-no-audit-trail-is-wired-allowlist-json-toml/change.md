---
id: harden-admin-and-github-pr-diff-edges-admin-mutations-fail-closed-when-no-audit-trail-is-wired-allowlist-json-toml
state: implementing
type: bug_fix
base_commit: c69e0e2fefdf11d506f55c528035d422973e4f1a
---

# Harden /admin and github-pr-diff edges: /admin mutations fail closed when no audit trail is wired, allowlist JSON/TOML detection shares the loader rule, dangling allowlist symlinks are refused not replaced, empty --file is a usage error, pure rename/copy/mode changes say content unchanged and copies get copy from/to lines

## Intent

Harden /admin and github-pr-diff edges: /admin mutations fail closed when no audit trail is wired, allowlist JSON/TOML detection shares the loader rule, dangling allowlist symlinks are refused not replaced, empty --file is a usage error, pure rename/copy/mode changes say content unchanged and copies get copy from/to lines

## Affected Canonical Specs

- `discord`
- `plugins`

## Acceptance Criteria

- With no audit trail wired (no DB) /admin users/channels mutations reply 'Refused: audit log unavailable (SAFE-5)' and write nothing; /admin and the allowlist loader use one shared case-sensitive .json rule (isJsonAllowlistPath) so allowlist.JSON is edited as TOML; a dangling or looping allowlist symlink is refused by plan, write and config show and is never replaced by a regular file; github-pr-diff --file that is empty after normalization (./, whitespace) is a usage error with no API call; a pure rename/copy/mode change with no patch and 0 line changes says content unchanged instead of binary or too large, and copied files get copy from/to lines; fixture regression tests for each

## No-spec Rationale

Not applicable

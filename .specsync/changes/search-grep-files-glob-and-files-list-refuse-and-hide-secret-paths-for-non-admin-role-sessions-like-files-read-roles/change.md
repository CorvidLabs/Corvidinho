---
id: search-grep-files-glob-and-files-list-refuse-and-hide-secret-paths-for-non-admin-role-sessions-like-files-read-roles
state: implementing
type: bug_fix
base_commit: 6e5370dd5174f006ec16ffc609116c016055a7b8
---

# Search-grep, files-glob and files-list refuse and hide secret paths for non-ADMIN role sessions like files-read (ROLES-CHAT-8)

## Intent

search-grep, files-glob and files-list refuse and hide secret paths for non-ADMIN role sessions like files-read (ROLES-CHAT-8)

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- In a non-ADMIN role session (CORVIDINHO_ACTING_IS_ADMIN set, not admin), search-grep and git-diff refuse an explicit secret path (.env*, .ssh, keys, keystores; also via ./, .., absolute path, --path, or a symlink) with exit 2 and the ROLES-CHAT-8 message like files-read, a recursive search never returns lines from secret files, whatever --include is passed, and git-diff (worktree or --staged) never lists or prints a tracked secret file; files-glob and files-list leave secret paths out (also through a symlinked directory) and files-list refuses a secret directory; ADMIN and the local CLI keep the same access as files-read

## Review follow-up

Adversarial review found `git-diff` (non-mutating, in the non-ADMIN catalog)
printed a tracked secret file's diff, and a `files-glob` pattern through a
symlinked directory (`notes/*`, notes -> .ssh) listed names inside `.ssh`.
Both now apply the same gate; recursive `search-grep` match records take the
file from the NUL-terminated name, so a name holding `:N:` parses correctly.

## No-spec Rationale

Not applicable

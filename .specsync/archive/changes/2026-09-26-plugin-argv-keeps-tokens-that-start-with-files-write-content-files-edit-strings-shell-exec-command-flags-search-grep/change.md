---
id: plugin-argv-keeps-tokens-that-start-with-files-write-content-files-edit-strings-shell-exec-command-flags-search-grep
state: archived
type: bug_fix
base_commit: cfcf2b7c6ab71ed46ce4f319969c26bc3c599c0f
---

# Plugin argv keeps tokens that start with -- (files-write content, files-edit strings, shell-exec command flags, search-grep patterns) and files-write refuses to empty a non-empty file without --allow-empty

## Intent

Plugin argv keeps tokens that start with -- (files-write content, files-edit strings, shell-exec command flags, search-grep patterns) and files-write refuses to empty a non-empty file without --allow-empty

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- files-write writes --content / positional content that starts with '--' verbatim; files-write refuses (exit 1, file unchanged) to replace a non-empty file with empty or missing content unless --allow-empty is passed, and a value flag with no value is an error; files-edit --old/--new accept '--' values; shell-exec runs the command with its own '--' flags intact (only leading --json/--command/--cwd/-- are its options) and refuses words left after --command; search-grep uses a '--' token as the pattern; --flag=value works for value flags

## No-spec Rationale

Not applicable

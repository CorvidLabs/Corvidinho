---
change: plugin-argv-keeps-tokens-that-start-with-files-write-content-files-edit-strings-shell-exec-command-flags-search-grep
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-243` | `tests/plugins.argv-dashes.test.ts` | 9 tests: front matter / SQL content written verbatim; empty or dangling content refused over a non-empty file, `--allow-empty` opts in; files-edit `--` values; shell-exec keeps `--dry-run` and trailing `--json`, refuses words after `--command`; search-grep `--no-verify` pattern. 0/9 pass on main, 9/9 after. |

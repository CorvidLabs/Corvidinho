---
change: plugin-argv-keeps-tokens-that-start-with-files-write-content-files-edit-strings-shell-exec-command-flags-search-grep
artifact: tasks
---

# Tasks

- [x] Regression test that fails before the fix.
- [x] Shared argv parser for files-* and search-grep.
- [x] files-write refuses to empty a non-empty file without --allow-empty.
- [x] shell-exec keeps the command's own flags; leftover words after --command refused.
- [x] Delta REQ-plugins-243 and spec files list.

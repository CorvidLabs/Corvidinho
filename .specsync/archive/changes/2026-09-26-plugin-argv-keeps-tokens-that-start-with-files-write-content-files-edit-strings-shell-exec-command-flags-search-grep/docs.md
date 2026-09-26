---
change: plugin-argv-keeps-tokens-that-start-with-files-write-content-files-edit-strings-shell-exec-command-flags-search-grep
artifact: docs
---

# Docs

The `files-write`, `search-grep` and `shell-exec` descriptions (the
model-facing tool text) now say content and patterns may start with `--`,
name `--allow-empty`, and say shell-exec options go before the command.
`plugins/files/argv.ts` documents the parsing rules. No other docs change.

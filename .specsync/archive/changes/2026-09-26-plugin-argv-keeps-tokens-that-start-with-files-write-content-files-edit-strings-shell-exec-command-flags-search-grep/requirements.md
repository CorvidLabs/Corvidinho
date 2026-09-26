---
change: plugin-argv-keeps-tokens-that-start-with-files-write-content-files-edit-strings-shell-exec-command-flags-search-grep
artifact: requirements
---

# Requirements

SAFE intent (no silent data loss; a dry run must stay a dry run) and PLUGIN-1
(typed file/search/shell commands). Added REQ-plugins-243: argv tokens that
start with `--` are never silently dropped by files-*, search-grep or
shell-exec, and files-write refuses to empty a non-empty file without
`--allow-empty`. REQ-plugins-081..083 and 086..087 are unchanged.

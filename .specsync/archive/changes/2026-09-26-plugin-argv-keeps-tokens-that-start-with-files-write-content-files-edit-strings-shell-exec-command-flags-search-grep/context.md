---
change: plugin-argv-keeps-tokens-that-start-with-files-write-content-files-edit-strings-shell-exec-command-flags-search-grep
artifact: context
---

# Context

Bug report plugins-exec-3 (high). The files, search and shell plugins each had
a `flagValue` that returned undefined when the value started with `--`, and
a positional pass that dropped every `--*` token. Results:

- `files-write doc.md --content "---\ntitle: New…"` (YAML front matter) or
  `files-write 001.sql "-- migration…"` wrote `""`; the size guard only
  blocks growth, so an existing file was truncated to 0 bytes and the tool
  returned ok ("Wrote 0 bytes"). Silent data loss.
- `shell-exec echo git push --dry-run origin main` ran `git push origin
  main`: a dry run became a real push.
- `search-grep --no-verify src` searched for `src` across the whole tree.

The model tool loop passes argv arrays straight to these handlers, so a model
at code tier hits this with ordinary content. SAFE intent: never depend on the
prompt to save the repo.

Out of scope (noted in the PR): the CLI layer (`src/cli.ts`) still consumes
global flags such as `--no-verify`, `--json` and `--help` after
`plugins run <name> --`; the web and memory plugins keep their own
`flagValue` copies.

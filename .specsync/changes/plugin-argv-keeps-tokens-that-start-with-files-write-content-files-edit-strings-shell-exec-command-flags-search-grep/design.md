---
change: plugin-argv-keeps-tokens-that-start-with-files-write-content-files-edit-strings-shell-exec-command-flags-search-grep
artifact: design
---

# Design

- New `plugins/files/argv.ts` `parseArgv(args, valueFlags, boolFlags)`:
  value flags take the next token verbatim (or `--flag=value`), first
  occurrence wins, a dangling value flag throws `ArgvError`; bool flags are
  collected; `--` ends options; every other token is positional.
- files-read/write/edit/glob/list/delete and search-grep use it with the value
  flags they already knew; bool flags are the ones the old positional pass
  skipped plus `--allow-empty`. `ArgvError` maps to exit 1.
- files-write: with `--path`, all positionals are content (before, the first
  was dropped). If the target exists and is non-empty and the new content is
  empty, refuse unless `--allow-empty`.
- search-grep: with `--pattern`, the first positional is the path.
- shell-exec keeps its own parser: leading `--json`, `--command <v>` /
  `--command=<v>`, `--cwd <v>` (still ignored; cwd pinned) and `--`; from
  the first other token the rest is the command verbatim. `--command` plus
  leftover words, or `--command` twice, is refused before spawn.
- No new env vars or slash commands. One new plugin flag, `--allow-empty`,
  because the fix needs an explicit opt-in for emptying a file.

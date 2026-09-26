---
module: plugins
change: plugin-argv-keeps-tokens-that-start-with-files-write-content-files-edit-strings-shell-exec-command-flags-search-grep
---

# Delta — plugins (argv keeps '--' tokens; files-write empty guard)

## Added

### REQUIREMENT REQ-plugins-243

The `files-*`, `search-grep` and `shell-exec` builtins SHALL NOT silently
drop an argv token because it starts with `--`. A value flag (`--content`,
`--path`, `--old`, `--new`, `--pattern`, `--include`, `--command`)
SHALL take the next token verbatim, even one that starts with `--`, or an
inline `--flag=value`; a value flag with no value SHALL be an error. For
`files-*` and `search-grep` a token that is not a known flag SHALL stay
positional, and a bare `--` SHALL end option parsing. `shell-exec` SHALL
treat only leading `--json`, `--command`, `--cwd` and `--` as its own
options; every later token SHALL be part of the command verbatim, and words
left after `--command` SHALL be refused rather than dropped. `files-write`
SHALL refuse (exit 1, file unchanged) to replace a non-empty file with empty or
missing content unless `--allow-empty` is passed.

Acceptance Criteria
- `files-write` with `--content` or positional content that starts with `--` (YAML front matter, SQL comment) writes it verbatim; unknown `--` words in positional content are kept; `--content=value` works; with `--path` every positional is content.
- `files-write` with missing, empty or dangling `--content` over a non-empty file is refused and the file is unchanged; `--allow-empty` empties it.
- `files-edit --old / --new` accept values that start with `--`.
- `shell-exec echo git push --dry-run origin main` runs with `--dry-run` intact; a trailing `--json` stays in the command; leading `--json`/`--command`/`--command=` still work; `--command X --dry-run` is refused before spawn.
- `search-grep --no-verify src` searches for `--no-verify` under `src`; `--pattern` takes a `--` value, `--path=` works, and with `--pattern` the first positional is the path.

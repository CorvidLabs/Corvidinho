# Lesson bundle — plugin-argv-keeps-tokens-that-start-with-files-write-content-files-edit-strings-shell-exec-command-flags-search-grep

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Plugin argv keeps tokens that start with -- (files-write content, files-edit strings, shell-exec command flags, search-grep patterns) and files-write refuses to empty a non-empty file without --allow-empty
- **Kind**: BugFix
- **Specs**: plugins
- **Paths**: plugins/files/argv.ts, plugins/files/commands.ts, plugins/shell/commands.ts, plugins/search/commands.ts, tests/plugins.argv-dashes.test.ts
- **Acceptance**: files-write writes --content / positional content that starts with '--' verbatim; files-write refuses (exit 1, file unchanged) to replace a non-empty file with empty or missing content unless --allow-empty is passed, and a value flag with no value is an error; files-edit --old/--new accept '--' values; shell-exec runs the command with its own '--' flags intact (only leading --json/--command/--cwd/-- are its options) and refuses words left after --command; search-grep uses a '--' token as the pattern; --flag=value works for value flags

## Evidence

- Verification commit: `3b6faaa83ef1d5d04bd6d2bdf5d7b4aac9914b66`
- Base commit: `cfcf2b7c6ab71ed46ce4f319969c26bc3c599c0f`
- Verified by: `specsync check --spec plugins`

## From the change's context.md

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

## From the change's design.md

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

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-243` | `tests/plugins.argv-dashes.test.ts` | 9 tests: front matter / SQL content written verbatim; empty or dangling content refused over a non-empty file, `--allow-empty` opts in; files-edit `--` values; shell-exec keeps `--dry-run` and trailing `--json`, refuses words after `--command`; search-grep `--no-verify` pattern. 0/9 pass on main, 9/9 after. |

## Where these lessons go

- `specs/plugins/context.md`

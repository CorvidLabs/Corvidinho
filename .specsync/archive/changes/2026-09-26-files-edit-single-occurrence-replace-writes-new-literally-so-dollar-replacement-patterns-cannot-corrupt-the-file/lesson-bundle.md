# Lesson bundle — files-edit-single-occurrence-replace-writes-new-literally-so-dollar-replacement-patterns-cannot-corrupt-the-file

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Files-edit single-occurrence replace writes --new literally so dollar replacement patterns cannot corrupt the file (plugins-exec-5)
- **Kind**: BugFix
- **Specs**: plugins
- **Paths**: plugins/files/commands.ts, tests/files.plugins.test.ts
- **Acceptance**: files-edit without --replace-all writes --new byte-for-byte: $$, $&, $', $` and $<n> in --new are not expanded as String.replace patterns, matching the --replace-all path

## Evidence

- Verification commit: `a25ebc435a3c83ff43d0c212541b10f3b1b51c59`
- Base commit: `3720b97c0dfc6ee65187a6278c13f8e1058632d3`
- Verified by: `specsync check --spec plugins`

## From the change's context.md

# Context

A bug sweep (plugins-exec-5) found that `files-edit` without `--replace-all` called `original.replace(oldStr, newStr)` with the model-supplied `--new` string as the replacement. JavaScript expands replacement patterns in that argument (`$$` becomes `$`, `$&` the match, `$'` the text after the match, `` $` `` the text before the match), so an edit to a Makefile, shell script or JS/regex source containing `$$` or `$'` wrote different bytes than requested while the tool still reported `Edited <path>`. The `--replace-all` path (split/join) was already literal, so the two modes disagreed.

Repro before the fix: `Makefile` = `run:\n\techo OLD\n`; `files-edit Makefile --old "echo OLD" --new "echo $$HOME and $' tail"` returned ok and wrote `run:\n\techo $HOME and \n tail\n`.

## From the change's design.md

# Design

- Single-occurrence `files-edit` uses a function replacer, `original.replace(oldStr, () => newStr)`, so `--new` is inserted as literal data. The existing uniqueness check (refuse when `--old` appears more than once) still runs first, so the first match is the only match.
- `--replace-all` is unchanged (split/join was already literal); both modes now write `--new` byte-for-byte.
- SAFE-2 protected-path refusal, the path clamp and the size-explosion guard are untouched and still run on the computed content.
- No new env vars, flags or slash commands.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-237` | `tests/files.plugins.test.ts` | "files-edit writes --new literally; $ replacement patterns are not expanded": a single-occurrence Makefile edit whose `--new` contains `$$`, `$'`, `$&`, `` $` ``, `$1` and `$<n>` leaves exactly that text in the file (failed on main: `$$` became `$`, `$'` became the trailing newline, `$&` and `` $` `` expanded to the match and the preceding text); a `--replace-all` edit on a two-match file writes the same literal text twice. |
| `REQ-plugins-081` | `tests/files.plugins.test.ts` | Existing happy-path read/write/edit/glob/list and SAFE-2 refuse tests still pass (plain `--old alpha --new beta` edit unchanged). |

## Where these lessons go

- `specs/plugins/context.md`

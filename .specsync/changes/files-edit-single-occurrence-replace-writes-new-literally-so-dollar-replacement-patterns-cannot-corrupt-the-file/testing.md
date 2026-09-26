---
change: files-edit-single-occurrence-replace-writes-new-literally-so-dollar-replacement-patterns-cannot-corrupt-the-file
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-237` | `tests/files.plugins.test.ts` | "files-edit writes --new literally; $ replacement patterns are not expanded": a single-occurrence Makefile edit whose `--new` contains `$$`, `$'`, `$&`, `` $` ``, `$1` and `$<n>` leaves exactly that text in the file (failed on main: `$$` became `$`, `$'` became the trailing newline, `$&` and `` $` `` expanded to the match and the preceding text); a `--replace-all` edit on a two-match file writes the same literal text twice. |
| `REQ-plugins-081` | `tests/files.plugins.test.ts` | Existing happy-path read/write/edit/glob/list and SAFE-2 refuse tests still pass (plain `--old alpha --new beta` edit unchanged). |

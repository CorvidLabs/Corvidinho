---
change: safe-3-shell-exec-cd-clamp-reads-quoting-the-way-the-shell-does-escaped-backslash-before-a-newline-comments-and-here
artifact: tasks
---

# Tasks

- [x] Regression tests for the reported forms and the remaining quoting bypasses (unit + end to end, no spawn); new cases fail on `main`.
- [x] Tokenizer reads continuations, comments, here-docs and `$( )` ends the way the shell does; both readings of `<<` are checked, including inside `eval`.
- [x] Tokenizer returns a substitution tree so each character is tokenized once per reading; nesting too deep to check refuses instead of throwing.
- [x] A `cd` / `pushd` left open by an unterminated quote or trailing `\` refuses.
- [x] Delta modifies REQ-plugins-087; spec invariant, scenario, error rows and files list updated.
- [x] specsync check, tsc, bun test, fledge verify green; differential fuzz against dash and bash clean.

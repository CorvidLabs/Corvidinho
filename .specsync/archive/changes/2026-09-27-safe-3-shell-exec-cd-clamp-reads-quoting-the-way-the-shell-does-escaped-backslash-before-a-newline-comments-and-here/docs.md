---
change: safe-3-shell-exec-cd-clamp-reads-quoting-the-way-the-shell-does-escaped-backslash-before-a-newline-comments-and-here
artifact: docs
---

# Docs

- `specs/plugins/plugins.spec.md`: the shell-exec invariant describes how the clamp reads quoting, continuations, comments, `$(…)` and `<<` (both readings) and the open cd/pushd refusal; a new "clamp reads quoting like the shell" scenario; the SAFE-3 error row names comments and here-docs, and a new row covers an open cd/pushd; `tests/shell.clamp-quoting.test.ts` joins the files list.
- No operator docs change: `shell-exec` usage, flags and the refusal message are unchanged. No CHANGELOG/STATUS edit (bug-fix slice).

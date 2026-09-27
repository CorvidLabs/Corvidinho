---
change: safe-3-shell-exec-cd-clamp-fails-closed-on-redirections-quote-aware-tokenizing-backslash-newline-continuations-expanded
artifact: docs
---

# Docs

- `specs/plugins/plugins.spec.md`: the shell-exec invariant, the SAFE-3 error-table row, and the behavioral scenarios now name the fail-closed forms (redirections, quoting, `\`-newline, expanded command words, command substitutions, DIRSTACK) and the runtime CDPATH guard; the new test file is added to the files list.
- No operator docs change: `shell-exec` usage, flags and refusal message are unchanged. No CHANGELOG/STATUS edit (bug-fix slice).

---
change: shell-exec-safe-3-cd-clamp-skips-cd-options-prefix-words-and-quoting-refuses-cd-expansions-and-cdpath-jumps-and-drops
artifact: docs
---

# Docs

- `specs/plugins/plugins.spec.md`: the shell-exec invariant and the SAFE-3 error row now name the refused forms (`cd -`, options, prefix words, expansions, CDPATH) and the dropped `CDPATH` / `OLDPWD`.
- No operator docs change: `shell-exec` usage, flags and refusal message are unchanged. No CHANGELOG/STATUS edit (bug-fix slice).

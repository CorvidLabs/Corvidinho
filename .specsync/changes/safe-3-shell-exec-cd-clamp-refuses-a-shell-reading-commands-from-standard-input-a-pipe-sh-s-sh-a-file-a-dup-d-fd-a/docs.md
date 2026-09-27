---
change: safe-3-shell-exec-cd-clamp-refuses-a-shell-reading-commands-from-standard-input-a-pipe-sh-s-sh-a-file-a-dup-d-fd-a
artifact: docs
---

# Docs

- `specs/plugins/plugins.spec.md`: the shell-exec invariant says a shell reading its commands from standard input refuses unless the input is a clean here-string / here-doc, and names the `-c`-from-input forms; a new "shell reading stdin" scenario; a new SAFE-3 error row; `tests/shell.clamp-stdin.test.ts` joins the files list.
- No operator docs change: `shell-exec` usage, flags and the refusal message format are unchanged. No CHANGELOG / STATUS edit (bug-fix slice).

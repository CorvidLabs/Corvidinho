---
change: safe-3-shell-exec-cd-clamp-checks-the-scripts-a-command-runs-in-a-shell-sourced-handed-to-a-shell-as-a-file-here-doc-or
artifact: docs
---

# Docs

- `specs/plugins/plugins.spec.md`: the shell-exec invariant describes `trap`, `-c -` / option clusters, the script checks and what refuses, alias refusal, and the residual routes a lexical clamp cannot see; new scenario "SAFE-3 clamp checks the scripts a command runs"; two new SAFE-3 error rows; `tests/shell.clamp-scripts.test.ts` joins the files list.
- No operator docs change: `shell-exec` usage, flags and the refusal message format are unchanged (refusals inside a script append `(in SCRIPT)` to the target). No CHANGELOG/STATUS edit (bug-fix slice).

---
change: safe-3-shell-exec-cd-clamp-checks-the-scripts-a-command-runs-in-a-shell-sourced-handed-to-a-shell-as-a-file-here-doc-or
artifact: requirements
---

# Requirements

- SAFE-3 (captured in `hi/safe.md`): shell commands cannot `cd` their way out of the project root.
- The requester's call on the #226 follow-up: check the contents of scripts a command runs at check time, fail closed; document interpreters (`python3 -c`, `node -e`, …) as residual risk.
- Modify REQ-plugins-087 (delta `deltas/plugins.md`): `trap` actions are checked like `eval`; alias definitions refuse; `-` ends a shell's options and `o` / `O` in a cluster take the next word; each script the command runs in a shell (sourced, `BASH_ENV` / `--rcfile`, shell operand or input, here-doc / here-string, run by path) is read from every dir the shell may be in and checked like a command, and a script that cannot be checked (expanding path, missing, too large or too many, written by the command, input that would expand or cannot be seen) refuses.
- No new REQ, env var, command, flag or package version.

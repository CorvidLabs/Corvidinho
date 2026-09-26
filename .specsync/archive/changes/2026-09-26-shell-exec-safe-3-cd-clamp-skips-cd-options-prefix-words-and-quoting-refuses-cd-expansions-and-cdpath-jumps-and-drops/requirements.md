---
change: shell-exec-safe-3-cd-clamp-skips-cd-options-prefix-words-and-quoting-refuses-cd-expansions-and-cdpath-jumps-and-drops
artifact: requirements
---

# Requirements

- SAFE-3 (captured in `hi/safe.md`): shell commands cannot `cd` their way out of the project root.
- Modify REQ-plugins-087 (delta `deltas/plugins.md`): the clamp finds `cd` / `pushd` behind prefix words and assignments, skips options, dequotes words, and refuses `-`, expansions and CDPATH-searched targets; the child shell does not inherit `CDPATH` or `OLDPWD`.
- No new REQ, env var, command or package version.

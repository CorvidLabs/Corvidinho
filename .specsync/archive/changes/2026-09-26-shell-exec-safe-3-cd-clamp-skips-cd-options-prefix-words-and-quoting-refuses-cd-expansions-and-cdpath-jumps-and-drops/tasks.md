---
change: shell-exec-safe-3-cd-clamp-skips-cd-options-prefix-words-and-quoting-refuses-cd-expansions-and-cdpath-jumps-and-drops
artifact: tasks
---

# Tasks

- [x] Regression test reproducing the SAFE-3 clamp bypasses (fails before fix).
- [x] Clamp skips prefix words, assignments and cd/pushd options; dequotes words; refuses `-`, expansions and CDPATH-searched targets.
- [x] shell-exec child env drops inherited CDPATH and OLDPWD.
- [x] Delta modifies REQ-plugins-087; spec invariant, error row and files list updated.
- [x] specsync check, tsc, bun test, fledge verify green.

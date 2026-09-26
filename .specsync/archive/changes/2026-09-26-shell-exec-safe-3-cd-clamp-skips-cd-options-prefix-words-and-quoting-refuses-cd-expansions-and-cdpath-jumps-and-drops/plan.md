---
change: shell-exec-safe-3-cd-clamp-skips-cd-options-prefix-words-and-quoting-refuses-cd-expansions-and-cdpath-jumps-and-drops
artifact: plan
---

# Plan

1. Add `tests/shell.clamp-bypass.test.ts` reproducing the five reported bypasses, the wrapper / quoting / expansion variants, and the inherited OLDPWD / CDPATH cases; confirm it fails on main.
2. Harden `firstDisallowedCd` in `plugins/shell/clamp.ts` and drop `CDPATH` / `OLDPWD` from the spawn env in `plugins/shell/commands.ts`.
3. Modify REQ-plugins-087 (delta); update the plugins spec invariant, error row and files list.
4. Run specsync check, tsc, bun test and fledge verify.

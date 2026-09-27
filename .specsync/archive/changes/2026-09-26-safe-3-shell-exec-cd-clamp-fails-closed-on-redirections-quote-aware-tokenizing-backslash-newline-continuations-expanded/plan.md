---
change: safe-3-shell-exec-cd-clamp-fails-closed-on-redirections-quote-aware-tokenizing-backslash-newline-continuations-expanded
artifact: plan
---

# Plan

1. Add `tests/shell.clamp-failclosed.test.ts` (unit + e2e) reproducing every reviewed escape (redirections, quoting, `\`-newline, expanded command words, substitutions, `X+=`, DIRSTACK, dynamic CDPATH) plus in-root allow cases; confirm the new file fails on main's clamp.
2. Rewrite `firstDisallowedCd` in `plugins/shell/clamp.ts` around a quote-aware tokenizer; add the runtime `CDPATH=; readonly CDPATH` prelude in `plugins/shell/commands.ts` and drop the lexical CDPATH refusal (keep the env drop).
3. Update the two CDPATH lexical assertions in `tests/shell.clamp-bypass.test.ts` to the new runtime-guarded behaviour.
4. Modify REQ-plugins-087 (delta); update the plugins spec invariant, error row, scenarios and files list.
5. Run specsync change check --commit / audit / check --require-coverage 100, tsc --noEmit, bun test, and fledge lanes run verify --non-interactive.

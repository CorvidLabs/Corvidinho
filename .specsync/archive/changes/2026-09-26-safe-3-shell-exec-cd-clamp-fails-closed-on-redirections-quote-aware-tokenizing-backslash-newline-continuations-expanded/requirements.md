---
change: safe-3-shell-exec-cd-clamp-fails-closed-on-redirections-quote-aware-tokenizing-backslash-newline-continuations-expanded
artifact: requirements
---

# Requirements

- SAFE-3 (captured in `hi/safe.md`): shell commands cannot `cd` their way out of the project root.
- Modify REQ-plugins-087 (delta `deltas/plugins.md`): the clamp fails closed — it joins backslash-newline continuations, tokenizes with quote awareness (quoted separators are not separators), drops redirections with their targets (and does not split on a redirection `&`), refuses expanded command words, an `eval` with an expanded argument, escaping `cd` inside command substitutions, and `DIRSTACK` writes. The `NAME+=value` assignment prefix is recognised.
- CDPATH is no longer refused lexically; the spawned shell runs `CDPATH=; readonly CDPATH` and does not inherit `CDPATH`/`OLDPWD`, so a `CDPATH` set anywhere in the command (including dynamically) cannot redirect a relative `cd`.
- No new REQ, env var, command or package version. Refusal stays exit 2 with the SAFE-3 message.

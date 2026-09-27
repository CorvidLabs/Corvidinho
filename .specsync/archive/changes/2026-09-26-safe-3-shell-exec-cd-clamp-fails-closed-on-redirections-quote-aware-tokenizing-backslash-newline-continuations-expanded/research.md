---
change: safe-3-shell-exec-cd-clamp-fails-closed-on-redirections-quote-aware-tokenizing-backslash-newline-continuations-expanded
artifact: research
---

# Research

- `/bin/sh` here is dash. The reviewed escapes were reproduced end to end through `runPlugin` (as the tests invoke it): redirections around `cd` (`>/dev/null cd /etc`, `cd 2>&1 /etc`), quoted separators/targets, `\`-newline continuations, expanded command words, and `$(…)`/backtick substitutions all printed a path outside the root on the merged clamp; all are also present on `main` before #187, so none is a new regression.
- POSIX word-splitting removes quotes only after tokenizing, and `<`/`>` are metacharacters that delimit tokens even without spaces (`cd>/dev/null /etc`), so a lexical clamp must be quote-aware and must strip redirections to see the real target.
- Command substitutions run in a subshell, so a `cd` inside one does not move the parent cwd — but it *does* let the substituted command run outside the root (`$(cd /etc && cat secret)`), which is why escaping cd inside `$(…)`/backticks is refused.
- Runtime CDPATH guard verified in dash and bash: `sh -c 'CDPATH=; readonly CDPATH 2>/dev/null; eval "$1" 2>&1'` leaves exit codes and stdout intact; a later `CDPATH=/` assignment fails as readonly (dash aborts the script — fail closed; bash prints a readonly error and keeps the cwd), so a relative `cd sub` stays in-root.
- Out of a pure lexer's reach and left as leftover risk: `sh -c '…'`, `exec env -C`, `.`/`source`, `trap`, `alias`, and symlink `pwd -P`. On this box dash has no `pushd`/`popd`/`DIRSTACK`; the `DIRSTACK[…]=` vector is bash-only.
- Callers: only `plugins/shell/commands.ts` uses `firstDisallowedCd`; `stripQuotes` stays exported through `plugins/shell/index.ts`.

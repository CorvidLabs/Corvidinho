---
change: safe-3-shell-exec-cd-clamp-refuses-a-shell-reading-commands-from-standard-input-a-pipe-sh-s-sh-a-file-a-dup-d-fd-a
artifact: plan
---

# Plan

1. Reproduce on `main`: `firstDisallowedCd` returns null for the piped-stdin, `sh -s`, `sh -`, here-string, `xargs sh -c`, `xargs -I` and unquoted here-doc forms, and the handler prints `/etc`.
2. Add `tests/shell.clamp-stdin.test.ts` (unit + end to end); confirm it fails with `main`'s `plugins/shell/clamp.ts` swapped in.
3. Tokenizer: keep fd / operator / here-doc body on redirection tokens; `<<<` as one token; `splitFragment` returns words and redirections.
4. Clamp: `shellArgs` (`-`, `o`-clusters, `--emulate`, `-s`, `--version`/`--help`), `commandWords` (exec wrappers, `coproc`, `find -exec`, xargs replace string), `shellInput` + `stdinCommands` + `hereDocText`; skip `command -v`.
5. Delta adds REQ-plugins-430; `plugins.spec.md` invariant, scenario, error row and files list updated.
6. `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.

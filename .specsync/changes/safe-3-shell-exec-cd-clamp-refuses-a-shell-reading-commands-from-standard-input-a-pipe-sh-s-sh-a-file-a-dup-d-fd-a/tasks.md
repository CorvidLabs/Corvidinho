---
change: safe-3-shell-exec-cd-clamp-refuses-a-shell-reading-commands-from-standard-input-a-pipe-sh-s-sh-a-file-a-dup-d-fd-a
artifact: tasks
---

# Tasks

- [x] Reproduce the piped-stdin / here-string escapes on `main`.
- [x] Regression test `tests/shell.clamp-stdin.test.ts` (fails with `main`'s clamp: 2 pass, 6 fail).
- [x] Tokenizer keeps fd, operator and here-doc body on redirection tokens; `<<<` is one token.
- [x] Clamp refuses a shell reading stdin (pipe, inherited, file, fd, process substitution, stream operand) unless it is a clean here-string / here-doc; refuses `-c` with no string and an `xargs -I` replace string in a `-c` string; reads `-` and `o`-clusters in shell options.
- [x] Delta adds REQ-plugins-430; spec invariant, scenario, error row and files list updated.
- [x] specsync check, tsc, bun test, fledge verify green.

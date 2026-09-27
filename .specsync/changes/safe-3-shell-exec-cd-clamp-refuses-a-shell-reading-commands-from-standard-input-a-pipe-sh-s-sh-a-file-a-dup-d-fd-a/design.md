---
change: safe-3-shell-exec-cd-clamp-refuses-a-shell-reading-commands-from-standard-input-a-pipe-sh-s-sh-a-file-a-dup-d-fd-a
artifact: design
---

# Design

All changes are in `plugins/shell/clamp.ts`, on top of #226's tokenizer.

- **Redirections keep their shape.** A redirection token now records its fd (`2>` → 2, `<`-family default 0, `>`-family 1; a quoted digit prefix is not an fd) and operator. `<<<` is one token (op `<<<`) in every reading. A here-doc token gets its body and whether the delimiter was quoted when `readHereDocs` reads it (dash / bash readings). In the bash-as-code reading (`hereDocs: false`) there is no body: those lines are read as commands there, so the check skips it. `stripRedirections` becomes `splitFragment`, which returns the same words plus each redirection with the word it takes.
- **Shell options.** `shellArgs(words, k, end)` replaces the inline loop: `-` ends options like `--`, each `o` / `O` in a cluster takes the next word, `--emulate` joins `-o` / `-O` / `--rcfile` / `--init-file` as taking an argument, and it reports `-c`, the first operand (-1 when there is none or `-s` without `-c`), and `--version` / `--help`. The existing any-word `-c` check (`shellScripts`) uses it, so `sh -c - 'cd /etc'` and `bash -co pipefail 'cd /etc'` are now checked.
- **Where a shell runs.** `commandWords(words, i)` lists the command word and what runs it: exec wrappers (`env` minus `-C` / `-S`, `exec`, `nohup`, `timeout` + duration, `nice`, `stdbuf`, `setsid`, `busybox`, `xargs`, bash `coproc [NAME] {`), each with its argument-taking options, and each `find -exec` / `-execdir` / `-ok` / `-okdir` command up to its `;` / `{} +`. It carries the replace string of an `xargs -I R` / `-i[R]` / `--replace[=R]`. Only these positions count, so `which sh`, `ls /bin/sh` or `grep bash` stay allowed.
- **The new check (`shellInput`)**, run after `shellScripts` for every non-`cd` command:
  - `-c` with no string after the options → refuse `SHELL -c (command string comes from input)`; a `-c` string holding the xargs replace string → refuse `R (xargs fills in the SHELL -c string)`.
  - a script operand that is `/dev/stdin`, `/dev/fd/N` or `/proc/*/fd/N` → refuse `OPERAND (reads commands from a stream)`; any other operand is a script file and is left alone (out of scope).
  - no operand, `-s` or `-` → the last fd-0 redirection decides: a here-string is checked like an `eval` argument (refuse `WORD (shell input would expand)` if it expands); a here-doc body is expanded like the shell does (`hereDocText`: `\$ \` \\ \`-newline lose the `\`; any other `$` / backtick → refuse `SHELL (shell input would expand)`) and checked like an `eval` argument; anything else — pipe, inherited stdin, file, dup'd / closed fd, process substitution — refuses `SHELL (reads commands from standard input)`.
  - `--version` / `--help` shells and a `command -v` / `-V` lookup are skipped.
- Every refusal still goes through `clampRefuseMessage` (exit 2, SAFE-3, `data.refused`) before spawn. No new flag, env var, config key or command.
- Design choice (pending Leif): `sh < file` / `bash -s < file` refuse (stdin is a file the clamp does not read), while `sh file` stays allowed as REQ-plugins-087 requires. Reading the file (as #233 does) or refusing `sh file` too is Leif's script-file decision.

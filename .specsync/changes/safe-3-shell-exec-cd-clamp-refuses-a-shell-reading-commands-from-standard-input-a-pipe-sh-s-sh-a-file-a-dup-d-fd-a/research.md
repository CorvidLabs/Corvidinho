---
change: safe-3-shell-exec-cd-clamp-refuses-a-shell-reading-commands-from-standard-input-a-pipe-sh-s-sh-a-file-a-dup-d-fd-a
artifact: research
---

# Research

- `/bin/sh` here is dash; `shell-exec` runs `sh -c 'CDPATH=; readonly CDPATH; eval "$1"'`, so the command text is read by dash, and any `bash` / `sh` it starts reads its own commands.
- POSIX `sh` (dash, bash, zsh, ksh …) reads commands from standard input when it gets no `-c` and no script operand, or when `-s` is given (operands then become `$1…`). A lone `-` ends the options (`sh -` reads stdin; `sh -c - 'cd /etc'` runs `cd /etc`, checked in dash and bash). Each `o` / `O` in an option cluster takes the next word (`bash -eo pipefail` reads stdin; `bash -co pipefail 'cd /etc'` runs `cd /etc`). `--version` / `--help` print and exit.
- `sh /dev/stdin` (and `/dev/fd/0`, `/proc/self/fd/0`) reads the pipe like `sh -s` (`echo 'cd /etc; pwd' | sh /dev/stdin` printed `/etc`).
- Standard input of a simple command is the last redirection of fd 0 (`<`, `<>`, `<&`, `<<`, `<<-`, `<<<`, `0>&…`); without one it is inherited: the pipe before it, the enclosing `{ }` / `( )` / loop / `$( )` input, or `shell-exec`'s own stdin. Only a here-string or here-doc puts text the clamp can read there.
- `<<<` is bash (dash rejects it: "redirection unexpected"), so a here-string only runs inside a bash (`bash -c "bash <<< '…'"` printed `/etc`). Reading it as a here-string in the dash pass too is conservative.
- An unquoted here-doc body is expanded before the shell reads it: `\$`, `` \` ``, `\\` and `\`-newline lose the `\`; `$…` and backticks expand. `sh <<EOF` + `c\\d /etc` printed `/etc` although `c\\d` is not `cd` to a code reading of the text. A quoted delimiter (`<<'EOF'`) keeps the body literal.
- GNU xargs appends input items as operands (so `xargs sh` runs a script named on stdin and `xargs sh -c` takes its command string from stdin: `echo 'cd /etc; pwd' | xargs -0 sh -c` printed `/etc`), and with `-I R` / `-i[R]` / `--replace[=R]` (default `{}`) it substitutes each input line for `R` inside every argument, the `-c` string included (`echo 'x; cd /etc; pwd' | xargs -i sh -c 'echo {}'` printed `x` and `/etc`). Options with a required argument: `-a -E -I -L -n -P -s -d`, `--arg-file --max-args --max-procs --max-chars --delimiter --process-slot-var`; `-i`, `-e`, `-l`, `--replace`, `--eof`, `--max-lines` take only an attached optional one.
- `find … -exec sh \;` hands the child its own stdin (`echo 'cd /etc; pwd' | find . -maxdepth 0 -exec sh \;` printed `/etc`); the `-exec` arguments end at `;` or `{} +`.
- Callers: only `plugins/shell/commands.ts` calls `firstDisallowedCd`; the refusal message format (`clampRefuseMessage`) is unchanged.

---
module: plugins
change: safe-3-shell-exec-cd-clamp-refuses-a-shell-reading-commands-from-standard-input-a-pipe-sh-s-sh-a-file-a-dup-d-fd-a
---

# Delta — plugins (shell-exec SAFE-3 clamp and shells reading standard input)

## Added

### REQUIREMENT REQ-plugins-430

The `shell-exec` SAFE-3 clamp (REQ-plugins-087) SHALL refuse, before spawn,
a shell whose commands it cannot see. A shell (`sh`, `bash`, `dash`,
`zsh`, `ksh`, `mksh`, `ash`, `yash`, `posh`, by name or path) counts when
it is the command word, or the command an exec wrapper runs (`env` without
`-C` / `-S`, `exec`, `nohup`, `timeout`, `nice`, `stdbuf`, `setsid`,
`busybox`, `xargs`, bash `coproc`), or the command after
`find … -exec` / `-execdir` / `-ok` / `-okdir` (up to its `;` or
`{} +`). Such a shell reads its commands from standard input when it has
no `-c` and no script operand, when `-s` is given, or when options end
with `-`; a `/dev/stdin`, `/dev/fd/N` or `/proc/*/fd/N` script operand is
a stream too. The clamp SHALL then read the command's last redirection of
fd 0: a here-string (`<<<`) SHALL be checked like an `eval` argument and
SHALL refuse if it would expand; a here-doc body SHALL be checked like an
`eval` argument as the shell expands it (an unquoted body drops the `\`
before `$`, a backtick, `\` and a newline, and any other `$` or backtick
refuses); any other input — a pipe, the standard input the command inherits,
a file (`<`, `<>`), a dup'd or closed fd, a process substitution — SHALL
refuse. A `-c` with no command string after its options (`xargs sh -c`)
SHALL refuse, and so SHALL a `-c` string that holds the replace string of
the `xargs -I` / `-i` / `--replace` that runs the shell. When the clamp
reads a shell's options, `-` SHALL end them like `--` and each `o` / `O` in
an option cluster (`-eo pipefail`) SHALL take the next word, for this check
and for the `-c` string check of REQ-plugins-087. A shell that only prints
`--version` / `--help`, or is only looked up (`command -v` / `-V`), is not
run and SHALL NOT refuse. Script files, `.` / `source`, `env -C`,
`git -C` / `make -C` and other interpreters are out of scope and unchanged;
`bash scripts/build.sh` SHALL stay allowed. No new flag, env var, config key
or command.

Acceptance Criteria
- `echo 'cd /etc; pwd' | sh`, `| /bin/sh`, `| env sh`, `| bash -eo pipefail`, `| { sh; }`, `| (sh)`, `| timeout -s KILL 5 sh`, `| nohup bash -i`, `printf 'cd /etc' | sh -s` (also `sh -s -- a b`), `| sh -`, `| sh /dev/stdin`, `| bash /proc/self/fd/0`, `echo x.sh | xargs -n1 sh`, `| find . -maxdepth 0 -exec sh \;`, `coproc sh`, `bash -c 'cat cmds | sh'` and `eval 'cat cmds | sh'` refuse as a shell reading standard input.
- `sh < cmds.txt`, `bash -s < cmds.txt`, `sh 0<&3`, `sh < <(…)`, `bash <(…)` and `sh <<< 'cd sub' < cmds.txt` (the last input wins) refuse.
- `echo 'cd /etc; pwd' | xargs -0 sh -c` refuses; `xargs -I{} sh -c 'echo {}'`, `xargs -I % sh -c 'echo %'`, `xargs -i bash -c 'echo {}'` and `xargs --replace=% sh -c 'echo %'` refuse naming the replace string.
- `bash <<< 'cd /etc; pwd'` and `bash -c "bash <<< 'cd /etc; pwd'"` refuse `/etc`; `bash <<< "$X"` refuses as input that would expand; an unquoted here-doc `sh <<EOF` whose body is `c\\d /etc` refuses `/etc`, and one whose body holds `$HOME` or `$(echo cd)` refuses as input that would expand.
- `sh -c - 'cd /etc'` and `bash -co pipefail 'cd /etc'` refuse `/etc`.
- `bash scripts/build.sh`, `sh -euo pipefail scripts/build.sh`, `sh -c 'cd sub'`, `bash -lc 'echo hi'`, `echo hi | sh -c 'cat'`, `bash <<< 'cd sub && ls'`, a quoted `<<'EOF'` or escaped unquoted here-doc with an in-root `cd sub`, `sh 3< x < /dev/null <<< 'cd sub'`, `xargs -0 sh -c 'for f; do …; done' sh`, `xargs -I{} sh -c 'echo "$1"' _ {}`, `find . -name '*.sh' -exec bash -n {} \;`, `sh --version`, `bash --help`, `command -v bash`, `which sh`, `ls -l /bin/sh`, `ps aux | grep bash` and a `git commit -m "$(cat <<'EOF' …)"` stay allowed.
- End to end each refused form returns exit 2 with SAFE-3 and `data.refused`, and nothing is spawned; an in-root here-doc (quoted or not), here-string (in bash) or `-c` string fed to a shell still runs and prints the in-root dir.
- Fixture: `tests/shell.clamp-stdin.test.ts`; every existing clamp fixture keeps its result.

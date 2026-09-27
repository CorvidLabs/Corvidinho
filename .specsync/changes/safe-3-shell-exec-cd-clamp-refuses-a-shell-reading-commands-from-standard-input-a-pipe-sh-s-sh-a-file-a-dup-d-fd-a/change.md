---
id: safe-3-shell-exec-cd-clamp-refuses-a-shell-reading-commands-from-standard-input-a-pipe-sh-s-sh-a-file-a-dup-d-fd-a
state: implementing
type: bug_fix
base_commit: fc0ed8da6e47dc1db452ee51044cde096db4e8bc
---

# SAFE-3 shell-exec cd clamp refuses a shell reading commands from standard input (a pipe, sh -s, sh -, a file, a dup'd fd, a process substitution, xargs sh) unless that input is a here-string or here-doc that checks clean, and a -c string that comes from input (xargs sh -c, xargs -I{} sh -c)

## Intent

SAFE-3 shell-exec cd clamp refuses a shell reading commands from standard input (a pipe, sh -s, sh -, a file, a dup'd fd, a process substitution, xargs sh) unless that input is a here-string or here-doc that checks clean, and a -c string that comes from input (xargs sh -c, xargs -I{} sh -c)

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- shell-exec refuses before spawn (exit 2, SAFE-3) a shell (the command word, or run by env, exec, nohup, timeout, nice, stdbuf, setsid, busybox, xargs, coproc or find -exec) that reads its commands from standard input: no -c and no script operand, -s, -, or a /dev/stdin, /dev/fd/N or /proc/*/fd/N operand, so echo 'cd /etc; pwd' | sh, | /bin/sh, | env sh, | bash -eo pipefail, printf 'cd /etc' | sh -s, | sh -, | sh /dev/stdin, | xargs sh, | find . -exec sh \;, sh < file, sh 0<&3, sh < <(...), bash <(...) and coproc sh refuse; a here-string or here-doc fed to that shell is checked like an eval argument (an unquoted here-doc body as the shell expands it), so bash <<< 'cd /etc; pwd', bash -c "bash <<< 'cd /etc; pwd'" and sh <<EOF + c\\d /etc refuse, and input that would expand refuses; a -c with no string after it (echo 'cd /etc' | xargs -0 sh -c) and a -c string holding the replace string of the xargs -I / -i / --replace that runs it refuse; a -c string after - (sh -c - 'cd /etc') or after an option cluster taking -o (bash -co pipefail 'cd /etc') is checked; bash scripts/build.sh, sh -euo pipefail scripts/build.sh, sh -c 'cd sub', bash -lc 'echo hi', echo hi | sh -c 'cat', bash <<< 'cd sub && ls', an in-root quoted or plain here-doc, xargs -I{} sh -c 'echo "$1"' _ {}, find -exec bash -n {} \;, sh --version, command -v bash, which sh, ps aux | grep bash and every existing clamp assertion keep their results; script files, source/., env -C, git -C and interpreters are unchanged; no new flag, env var or command

## No-spec Rationale

Not applicable

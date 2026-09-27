---
change: safe-3-shell-exec-cd-clamp-refuses-a-shell-reading-commands-from-standard-input-a-pipe-sh-s-sh-a-file-a-dup-d-fd-a
artifact: testing
---

# Testing

With `main`'s `plugins/shell/clamp.ts` swapped in, `bun test tests/shell.clamp-stdin.test.ts` gives 2 pass and 6 fail: every refusal unit test fails (`firstDisallowedCd` returns null for the piped, `-s`, `-`, `/dev/stdin`, file / fd / process-substitution, `xargs sh -c`, `xargs -I`, here-string, unquoted here-doc, `sh -c -` and `-co pipefail` forms) and the end-to-end test fails because the commands spawn (the `spawned` marker is written and the parent dir is printed). The two allow-guard tests pass on both. With this branch's clamp: 8 pass, 0 fail.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-430` (pipe / inherited stdin) | `tests/shell.clamp-stdin.test.ts` | `echo 'cd /etc; pwd' \| sh`, `\| /bin/sh`, `\| env sh`, `curl … \| bash`, `\| sh -s`, `sh -s -- a b`, `\| sh -`, `\| bash -eo pipefail`, `\| { sh; }`, `\| (sh)`, `\| timeout -s KILL 5 sh`, `\| nohup bash -i`, `\| xargs -n1 sh`, `\| find . -maxdepth 0 -exec sh \;`, `coproc sh`, `bash -c 'cat cmds \| sh'` and `eval 'cat cmds \| sh'` return `SHELL (reads commands from standard input)`; `sh /dev/stdin` and `bash /proc/self/fd/0` return `OPERAND (reads commands from a stream)`. |
| `REQ-plugins-430` (file / fd / process substitution) | `tests/shell.clamp-stdin.test.ts` | `sh < cmds.txt`, `bash -s < cmds.txt`, `sh 0<&3`, `sh < <(…)`, `bash <(…)` and `sh <<< 'cd sub' < cmds.txt` (last input wins) refuse as reading standard input. |
| `REQ-plugins-430` (`-c` from input) | `tests/shell.clamp-stdin.test.ts` | `echo 'cd /etc; pwd' \| xargs -0 sh -c` returns `sh -c (command string comes from input)`; `xargs -I{}`, `xargs -I %`, `xargs -i bash -c` and `xargs --replace=%` with the replace string in the `-c` string return `R (xargs fills in the SHELL -c string)`. |
| `REQ-plugins-430` (here-string / here-doc) | `tests/shell.clamp-stdin.test.ts` | `bash <<< 'cd /etc; pwd'` and `bash -c "bash <<< 'cd /etc; pwd'"` return `/etc`; `bash <<< "$X"` returns `$X (shell input would expand)`; `sh <<EOF` + `c\\d /etc` returns `/etc`; `sh <<EOF` with `$HOME` or `$(echo cd)` in the body returns `sh (shell input would expand)`. |
| `REQ-plugins-430` (shell options) | `tests/shell.clamp-stdin.test.ts` | `sh -c - 'cd /etc'` and `bash -co pipefail 'cd /etc'` return `/etc`. |
| `REQ-plugins-430` (allowed) | `tests/shell.clamp-stdin.test.ts` | `bash scripts/build.sh`, `sh -euo pipefail scripts/build.sh`, `sh -c 'cd sub'`, `bash -lc 'echo hi'`, `echo hi \| sh -c 'cat'`, `bash <<< 'cd sub && ls'`, in-root quoted / escaped here-docs, `sh 3< x < /dev/null <<< 'cd sub'`, `xargs -0 sh -c 'for f; …' sh`, `xargs -I{} sh -c 'echo "$1"' _ {}`, `find … -exec bash -n {} \;`, `sh --version`, `bash --help`, `command -v bash`, `which sh`, `ls -l /bin/sh`, `ps aux \| grep bash` and `git commit -m "$(cat <<'EOF' …)"` return null. |
| `REQ-plugins-430` (end to end) | `tests/shell.clamp-stdin.test.ts` | eleven escaping forms (`\| sh`, `\| /bin/sh`, `\| env sh`, `\| sh -s`, `\| sh -`, `\| sh /dev/stdin`, `xargs -0 sh -c`, `xargs -I{} sh -c 'echo {}'`, `bash -c "bash <<< …"`, unquoted here-doc `c\\d ..`, `sh -c - …`) return exit 2, SAFE-3, `data.refused`, no `spawned` marker and no parent-dir output; `sh <<'EOF'` / `sh <<EOF` with `cd sub && pwd`, `echo x \| sh -c 'cd sub && pwd'` and (with bash) `bash -c "bash <<< 'cd sub && pwd'"` run and print the in-root `sub`. |
| `REQ-plugins-087` (earlier fixtures) | `tests/shell.clamp-quoting.test.ts`, `tests/shell.clamp-failclosed.test.ts`, `tests/shell.clamp-bypass.test.ts`, `tests/shell.plugins.test.ts` | every existing allow/refuse assertion and integration case still passes unchanged (35 pass, 0 fail). |

## Automated coverage

- `bunx tsc --noEmit` — passed.
- `bun test` — 1712 pass, 2 skip, 0 fail (139 files).
- `bun test tests/shell.clamp-stdin.test.ts` — 8 pass, 0 fail; with `main`'s clamp — 2 pass, 6 fail.
- `specsync check --require-coverage 100` — 100% file and LOC coverage.
- `fledge lanes run verify --non-interactive` — green (4 steps; 1712 pass, 2 skip, 0 fail).
- Real-shell probes (dash `/bin/sh`, bash 5.2): each refused form above printed `/etc` (or the parent dir) on `main`; `sh -c - '…'` and `bash -co pipefail '…'` run their string in both dash and bash; `<<<` is a dash syntax error, so the end-to-end here-string cases run it inside `bash -c`.
- The common-command harness (`cd sub && ls`, pipes, `for` loops, `cat <<'EOF'`, `git log | cut`, …) gives the same results as on `main`.

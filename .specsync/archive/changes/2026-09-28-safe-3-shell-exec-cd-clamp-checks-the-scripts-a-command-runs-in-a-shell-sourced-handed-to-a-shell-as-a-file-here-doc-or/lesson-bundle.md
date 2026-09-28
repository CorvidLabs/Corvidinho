# Lesson bundle — safe-3-shell-exec-cd-clamp-checks-the-scripts-a-command-runs-in-a-shell-sourced-handed-to-a-shell-as-a-file-here-doc-or

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: SAFE-3 shell-exec cd clamp checks the scripts a command runs in a shell (sourced, handed to a shell as a file, here-doc or here-string, or run by path) and trap actions, refuses alias definitions and shells reading commands from an unknown input, and reads sh -c - and option clusters like -co pipefail
- **Kind**: BugFix
- **Specs**: plugins
- **Paths**: plugins/shell/clamp.ts, tests/shell.clamp-scripts.test.ts, tests/shell.clamp-quoting.test.ts
- **Acceptance**: shell-exec refuses before spawn (exit 2, SAFE-3) a command whose scripts would cd out of the root: a file sourced with . / source, named by BASH_ENV= or a shell's --rcfile, run by a shell as its operand or its < / <> input, or run by path (a #!-shell script or a #!-less text file, also behind env/exec/timeout/xargs/find -exec) whose text holds an escaping cd refuses as 'TARGET (in SCRIPT)', nested scripts included and relative to earlier in-root cds; a here-doc (unquoted body as the shell expands it) or here-string fed to a shell is checked the same way and refuses if it would expand; a shell reading commands from a pipe, inherited stdin or a process substitution, a missing sourced or shell-run script, a script path that would expand, a script over 1 MiB, and a script the command itself writes (redirection target or argument of a non-read-only command, in any order) refuse; trap actions are checked like eval arguments, alias definitions refuse, and sh -c - 'cd /etc' and bash -co pipefail 'cd /etc' refuse; in-root scripts (sh ok.sh, ./ok.sh, . ./ok.sh, bash scripts/build.sh, cd sub && sh ../ok.sh), binaries and #! scripts for other interpreters run by path, and programs the command builds first stay allowed; every existing clamp assertion keeps its result except that bash scripts/build.sh is now checked against a real file; interpreters (python3 -c, node -e, ...) and writers that do not name the script stay documented residual risk; no new flag, env var or command

## Evidence

- Verification commit: `6232019289110d01daf8eb91fb2ef0a271fd06e5`
- Base commit: `cfbcd0c705ff32a4c88d65978bdfbab7a76583ed`
- Verified by: `specsync check --spec plugins`

## From the change's context.md

# Context

Follow-up to #226 (REQ-plugins-087, SAFE-3 in `hi/safe.md`: shell commands
cannot `cd` their way out of the project root). #226 made the clamp read a
command's own text the way dash and bash do, and its handoff listed what a
lexical check of that text still could not see: a `cd` inside a script the
command runs. `. ./x.sh`, `sh x.sh`, `./x.sh`, `sh < x.sh`, a here-doc fed to
`sh`, `cat x.sh | sh` and `bash < <(…)` all ran a `cd /etc` from a file or
stream while `firstDisallowedCd` returned null. The requester was offered three ways
(refuse those forms, read the scripts at check time, or document them) plus
interpreters (`python3 -c` …), and chose: check script contents at check time,
fail closed, and leave interpreters documented as residual risk.

Probing the same area found four more gaps in #226's code, fixed here as the
same bug class (code the shell runs that the clamp never read):

- `trap 'cd /etc; …' EXIT` runs its action as a command (dash and bash).
- `alias c=cd` then `c /etc` on a later line runs `cd /etc` (dash and
  `bash --posix` expand aliases non-interactively).
- `sh -c - 'cd /etc'`: `-` ends the options like `--`; the clamp took `-` as
  the `-c` string.
- `bash -co pipefail 'cd /etc'`: `o` in the cluster takes `pipefail`; the
  clamp took `pipefail` as the `-c` string.

Constraints: bug fix only; no new flag, env var, command or package bump; no
CHANGELOG/STATUS edit. Command text and project files are untrusted. The clamp
stays lexical (REQ-plugins-087); a mount / namespace sandbox is out of scope.
The branch also carries the busy-lock test-timeout change (test-only).

## From the change's design.md

# Design

All in `plugins/shell/clamp.ts`; `firstDisallowedCd(cmd, root)` keeps its
signature and its results for commands that run no scripts.

- Tokenizer: redirection markers carry a kind (`in`, `out`, `rw` for `<>`,
  `heredoc`, `herestring`; `<<<` is now its own operator), and a here-doc
  marker gets its body (tabs stripped for `<<-`) and whether it is quoted once
  the body is read. `fragParts` replaces `stripRedirections` and returns the
  words plus the redirections with their targets.
- A per-call `Ctx` holds the root, the dirs the shell may be in (root plus each
  in-root `cd` target resolved from every dir before it, capped at 32), the
  paths the command writes, every path a script was looked up at, a script →
  verdict cache (a script sourcing itself is fine; a refused one keeps its
  message), and the script-text byte budget (1 MiB across the command).
- Writes pre-pass (`collectWrites`): output / `<>` redirection targets and the
  arguments of every command that is not read-only (a short list of readers
  and builtins, and read-only `git` subcommands); `eval`, `trap` and `-c`
  strings are read the same way. A script's writes are added when it is
  checked. `firstDisallowedCd` ends with a pass over every looked-up path, so a
  write seen later in the text (or in a later script, or a loop) still refuses.
- `scriptRefs`: for the simple command, `BASH_ENV=` words, `.` / `source`
  operands, and for every word that runs as a command (`commandIndexes`: the
  command word, what `exec` / `env` / `nice` / `timeout` / `stdbuf` / `xargs` /
  `nohup` / `setsid` / `busybox` run, and `find -exec…` commands) either the
  shell's `--rcfile`, operand or stdin, or a path run directly. Stdin is the
  last non-output redirection of the command: a here-doc (body checked; an
  unquoted one expanded by `hereDocScript`, refusing on `$` / backtick), a
  here-string, or a file; anything else refuses.
- `checkScript`: refuse an expanding path; look the path up from every dir (a
  bare name for `.` / a shell also on PATH); refuse a written path; refuse a
  missing sourced / shell-run file (a missing file run by path is a program the
  command builds); read a file run by path only if `isShellScript` (`#!` shell
  via `env` / `busybox`, or text without `#!`); refuse past the byte budget or
  32 scripts; otherwise check the text with `checkScriptText` (writes, then all
  readings, one nesting level deeper, so `MAX_NESTING` still bounds recursion).
- `shellArgs` is shared by `shellScripts`, `scriptRefs` and the writes pass:
  `-` ends options, `o` / `O` in a cluster take the next word, `-s` means stdin.
- `trap` actions are checked like `eval` (listing / reset forms skipped);
  `alias NAME=…` refuses.

## From the change's testing.md

# Testing

With `main`'s `plugins/shell/clamp.ts` swapped in, `bun test tests/shell.clamp-scripts.test.ts tests/shell.clamp-quoting.test.ts` gives 13 pass and 6 fail: all five script / trap / alias unit tests, the end-to-end refusal test, and the quoting test's `-c` case (`sh -c -`, `-co pipefail`) fail — `firstDisallowedCd` returns null and the scripts run. After the fix: 19 pass, 0 fail.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-087` (scripts run in a shell) | `tests/shell.clamp-scripts.test.ts` | with `bad.sh` holding `cd /etc`: `. ./bad.sh`, `source bad.sh`, `sh bad.sh`, `bash -e ./bad.sh arg`, `./bad.sh`, `./noshebang`, `./badbash` (`#!/usr/bin/env -S bash -e`, `cd ..`), `./varcd.sh` (`cd "$(dirname "$0")"`), `env X=1 ./bad.sh`, `timeout 5`, `exec`, `find -exec`, `. ./nested.sh`, `cd sub && . ./inner.sh`, `(cd sub && sh ../bad.sh)`, `BASH_ENV=./bad.sh bash -c true` and `bash --rcfile bad.sh -i ok.sh` refuse with `TARGET (in SCRIPT)`; `. ./self.sh` (sources itself) is null. |
| `REQ-plugins-087` (shell input) | `tests/shell.clamp-scripts.test.ts` | `sh < bad.sh`, `sh -s arg < bad.sh`, a quoted here-doc `cd /etc`, an unquoted here-doc `c\\d /etc`, `bash <<< 'cd /etc'` refuse; `sh <<EOF` with `$C`, `bash <<< "$X"` refuse as shell input that would expand; `cat bad.sh \| sh`, `{ sh; } < bad.sh`, `bash < <(cat bad.sh)` refuse as reading standard input; `. <(cat bad.sh)` as a script not named; in-root here-doc, `sh -s < okcd.sh` and `bash <<< 'echo hi'` are null. |
| `REQ-plugins-087` (cannot check) | `tests/shell.clamp-scripts.test.ts` | `sh missing.sh`, `. ./missing.sh` (not found); `sh "$S"`, `. ~/x.sh`, `sh *.sh` (path would expand); `echo 'cd /etc' > gen.sh; sh gen.sh`, `cp bad.sh ok.sh && ./ok.sh`, `cp /tmp/x new.sh && ./new.sh`, `for i in 1 2; do sh ok.sh; cp bad.sh ok.sh; done` (written by this command, also after the run in the text); a 1.2 MB script (too large). |
| `REQ-plugins-087` (`trap`, `alias`) | `tests/shell.clamp-scripts.test.ts` | `trap 'cd /etc' EXIT` → `/etc`, `trap -- 'cd ..' INT` → `..`, `trap "$X" EXIT` → `$X`, `alias c=cd`+newline+`c /etc` → `c=cd (alias)`; `trap 'rm -f tmp.txt' EXIT; trap - EXIT; trap -p` and bare `alias` are null. |
| `REQ-plugins-087` (allowed) | `tests/shell.clamp-scripts.test.ts` | `sh ok.sh`, `./ok.sh && ./okcd.sh`, `. ./ok.sh`, `bash scripts/build.sh`, `cd sub && sh ../ok.sh`, `chmod +x ok.sh && ./ok.sh`, `git add ok.sh && git commit -m x ok.sh && ./ok.sh`, `./bin-true` (binary), `./tool.py` (`#!/usr/bin/env python3`), `cc -o app main.c && ./build/app`, `sh -c 'echo hi' && bash -lc 'cd sub'` are null. |
| `REQ-plugins-087` (`-c -`, option clusters) | `tests/shell.clamp-quoting.test.ts` | `sh -c - 'cd /etc'` and `bash -co pipefail 'cd /etc'` → `/etc`; `bash -eo pipefail -c 'cd ..'` → `..`; `bash scripts/build.sh` moved to the scripts test, where the file exists. |
| `REQ-plugins-087` (end to end) | `tests/shell.clamp-scripts.test.ts` | `./bad.sh`, `sh bad.sh`, `. ./bad.sh`, `sh < bad.sh`, a here-doc fed to `sh`, `cat bad.sh \| sh`, `trap`, `alias` and write-then-run each return exit 2, SAFE-3, `data.refused`; neither the `spawned` marker nor `gen.sh` is created and `/etc` is never printed; `./ok.sh`, `sh okcd.sh`, `bash scripts/build.sh` and an in-root here-doc run and print their output. |
| `REQ-plugins-087` (earlier fixtures) | `tests/shell.clamp-failclosed.test.ts`, `tests/shell.clamp-bypass.test.ts`, `tests/shell.plugins.test.ts`, `tests/shell.clamp-quoting.test.ts` | every existing assertion passes unchanged except `bash scripts/build.sh`, which now needs the file to exist and is covered in the scripts test. |

## Automated coverage

- `bunx tsc --noEmit` — passed.
- `bun test` (Bun 1.4.2, as CI pins) — 1711 passed, 2 skipped, 0 failed.
- `specsync check --require-coverage 100` — 5 specs passed, file and LOC coverage 100%.
- `fledge lanes run verify --non-interactive` — green (see the change check record).
- Differential script harness (`scripts-diff.ts`, 47 command/shell pairs run in real dash / bash / `bash --posix` from a fresh project dir; a script appends to a marker when it lands in `/etc`): every escaping form refused, every in-root form allowed; the two interpreter cases (`./tool.py`, `python3 -c`) escape and are documented residual risk.
- #226's differential fuzz re-run against this clamp: 0 misses in 19,895 dash (1,540 escapes), 19,870 `bash --posix` (1,224) and 9,973 `bash` (629) samples; the share refused without an escape is unchanged (~45%, mostly unterminated quotes in random input).
- Common agent commands on a real layout stay allowed: `source .venv/bin/activate` (python3 -m venv), `. ./.env`, `./node_modules/.bin/tsc`, `git commit -m "$(cat <<'EOF' … EOF)"`, `cat <<EOF > notes.txt`, `find | xargs grep`, `npm run build && npm test`.
- Cost: a 100 KB command without scripts takes ~30 ms (was ~13 ms; the writes pre-pass tokenizes it once more); the 1 MiB script budget bounds a long sourced chain at ~0.26 s.

## Where these lessons go

- `specs/plugins/context.md`

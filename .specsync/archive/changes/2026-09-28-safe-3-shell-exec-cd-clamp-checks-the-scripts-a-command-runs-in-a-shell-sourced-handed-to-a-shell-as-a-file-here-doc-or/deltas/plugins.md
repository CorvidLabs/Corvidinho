---
module: plugins
change: safe-3-shell-exec-cd-clamp-checks-the-scripts-a-command-runs-in-a-shell-sourced-handed-to-a-shell-as-a-file-here-doc-or
---

# Delta — plugins (shell-exec SAFE-3 clamp checks the scripts a command runs)

## Modified

### REQUIREMENT REQ-plugins-087

`shell-exec` SHALL pin the spawned shell's initial cwd to the plugin cwd
(project root / task worktree) and SHALL refuse, before spawn, any command
whose lexically-resolved `cd` or `pushd` target would land outside that root
(SAFE-3). Refusals include absolute paths outside the root, `..` chains that
escape, `~` / `~user`, `$VAR` references, and bare `cd` (home). Relative `cd`
that stays under root and absolute `cd` under root SHALL be allowed. The clamp
SHALL be fail-closed: any command it cannot resolve to an in-root target
refuses.

The clamp SHALL tokenize the way the shell reads a command. Quotes and
backslash escapes SHALL join text into one word — a quoted or escaped space
never splits a target, so `cd "sub dir"` is checked as `sub dir` — and SHALL be
removed from a word before it is checked. A separator (`;`, `&`, `|`, newline,
`(`, `)`) inside single or double quotes or escaped with `\` is not a
separator. A backslash-newline outside single quotes SHALL be a line
continuation, and an escaped backslash before a newline SHALL NOT be one. `#`
at the start of a word SHALL start a comment that runs to the end of the line.
The end of a `$(…)` SHALL be found by these same rules. dash reads the lines
after `<<` / `<<-` as a here-doc body — data up to the exact delimiter line
(the delimiter word itself is not expanded, so a `$(` or backtick in it is
literal), apart from the `$(…)` and backtick substitutions of an unquoted
body — while
bash may read them as commands (`(( x << 2 ))` is arithmetic there), so a
command containing `<<` SHALL be checked under both readings and SHALL refuse
if either refuses, and so SHALL the re-parsed argument of `eval`; a quote
inside a here-doc body therefore cannot hide the commands after it. bash reads
`$'…'` as ANSI-C quoting, where `\` escapes even a `'`, while dash reads a `$`
then a single-quoted string, so a command containing `$'` SHALL also be
checked as bash reads it; a `$'…'` word holding a backslash escape counts as
an expansion. A `cd` or
`pushd` command that the text leaves open — an unterminated quote or a
trailing backslash — SHALL refuse, and so SHALL a command nested too deeply
to check. It SHALL find
a `cd` or `pushd` behind prefix words (`{`, `}`, `!`, `if`, `then`, `else`,
`elif`, `do`, `while`, `until`, `time`, `builtin`, `command`, `function NAME`)
and `NAME=value` / `NAME+=value` assignments. It SHALL drop redirections
(`>`, `>>`, `>&`, `>|`, `<`, `<>`, `<&`, `&>`, an `fd` prefix such as `2>&1`)
together with their targets wherever they appear in the command, SHALL NOT
treat the `&` of a redirection as a command separator, and SHALL skip
`cd` / `pushd` options (`-P`, `-L`, `-e`, `-@`, `-n`, `--`) to reach the real
target.

It SHALL refuse `-` (OLDPWD); a target containing `$`, a backtick, a glob or a
brace; a command word that the shell would expand (a command word containing
`$`, `$(…)` or a backtick); an `eval` whose argument would expand; and a write
to `DIRSTACK`. It SHALL re-parse the literal argument of `eval` as a command,
and likewise the action of `trap` and the `-c` string of a shell (`sh`,
`bash`, `dash`, `zsh`, `ksh`, `mksh`, `ash`, `yash`, `posh`, named by name or
path anywhere in a simple command, so also behind `env`, `exec`, `nohup`,
`timeout`, `xargs` or `find -exec`; `-` ends the shell's options like `--`, and
each `o` / `O` in an option cluster such as `-co pipefail` takes the next
word), refusing a `trap` action or `-c` string that would expand; it SHALL
refuse an alias definition (`alias NAME=…`); and it SHALL analyse the body of each command substitution (`$(…)` and backticks)
as a command, refusing an escaping `cd`/`pushd` found inside. The spawned shell
SHALL run `CDPATH=; readonly CDPATH` before the command and SHALL NOT inherit
`CDPATH` or `OLDPWD` from the bot's environment, so a `CDPATH` set anywhere in
the command (including one built dynamically) cannot redirect a relative `cd`
outside the root; `CDPATH` is therefore NOT refused lexically.

The clamp SHALL also check, before spawn, each script the command runs in a
shell, looking for it from the root and from every in-root `cd` target before
it: a file sourced with `.` / `source` or named by `BASH_ENV=` or a shell's
`--rcfile` / `--init-file`; a file a shell runs as its script operand or reads
as standard input through `<` / `<>`; a here-doc or here-string a shell reads
(an unquoted here-doc body as the shell expands it: `\$`, `` \` ``, `\\` and
`\`-newline lose the backslash); and a file run by path — a command word
holding `/`, also behind the exec wrappers above and `find -exec` — whose `#!`
line names a shell (directly or through `env` / `busybox`) or that has no `#!`
line and is text. Each script's text SHALL be checked like a command, scripts
it runs included, and a refusal inside it SHALL name the script
(`TARGET (in SCRIPT)`). It SHALL refuse a script path that would expand; a
sourced or shell-run script that does not exist; more than 1 MiB of script
text, more than 32 scripts, or more than 32 directories to look in; a script
that the command or one of its scripts writes, in any order — an output
redirection (`>`, `>>`, `<>`, …) target or an argument of a command that is not
read-only; a here-doc or here-string a shell reads that would expand; and a
shell reading its commands from anything else (a pipe, the standard input it
inherits, a process substitution). A file run by path that does not exist (a
program the command builds first) or is not a shell script (a binary, a `#!`
naming another interpreter) SHALL NOT be read.

Acceptance Criteria
- Unit fixtures cover allow/refuse cases above.
- Integration: `cd /tmp && …` and `cd ..` from root refuse with exit 2 and SAFE-3 message; `cd sub && …` inside project succeeds when allowlisted.
- Redirection-hidden targets refuse: `>/dev/null cd /etc`, `cd >/dev/null /etc`, `cd</dev/null /etc`, `cd 2>&1 /etc`, `cd -P >/dev/null /etc`; an in-root `cd sub >/dev/null` and `cd 2>&1 sub` stay allowed.
- Quote-aware forms refuse: `X="a b" cd /etc`, `X=';' cd /etc`, `cd "x /../.."`, `cd 'sub dir/../..'`; a backslash-newline `cd` (`c\`+newline+`d /etc`, `cd sub/\`+newline+`../..`) refuses; `cd "sub dir"` and `X=';' cd sub` stay allowed.
- Quoting is read as the shell reads it: `mkdir -p "a b" && cd "a b/../.."`, `cd "zz q/../.."`, `cd a\ b/../..`, `cd 'a b'/../..` and `cd sub/..\`+newline+`/..` refuse; so does a `cd /etc` after an escaped backslash and a newline (`echo a\\`+newline), after a `#` comment holding a quote, after a here-doc body holding a lone quote (`<<EOF`, `<<'EOF'`, `<<-EOF`), or after a `$(…)` whose comment or here-doc holds a `)`; an escaping `cd` in a `$(…)` or backtick of an unquoted here-doc body refuses, also when the delimiter holds a backtick (`cat <<`+backtick+`x`+newline+`#' $(cd ..)`); `(( x = 1 << 2 ))`+newline+`cd /etc` refuses, also inside `eval` when quote removal forms the `<<`; `cd "sub`, `cd 'sub` and `cd sub\` refuse; `$(`-nesting too deep to check refuses instead of throwing; `cd sub # comment`, `cd sub \`+newline+`&& ls`, and an in-root `cd sub` after a here-doc whose body holds a stray quote or apostrophe stay allowed; `eval "cd /; ls"` refuses `/`. End to end each refused form returns exit 2 with SAFE-3 and nothing is spawned.
- bash `$'…'` is read as bash reads it: `echo $'\''; cd /etc #'` refuses, and so do `cd $'\x2e\x2e'` and `$'\x63d' /etc`. A shell's `-c` string is checked like an `eval` argument: `sh -c 'cd /etc'`, `/bin/sh -ec 'cd /etc'`, `bash --norc -o pipefail -c 'cd ..'`, `env X=1 sh -c 'cd /etc'`, `timeout 5 sh -c 'cd /etc'`, `xargs sh -c 'cd /etc'`, `find . -exec sh -c 'cd /etc' \;` and `sh -c "cd $X"` refuse; `sh -c 'cd sub && ls'`, `bash -lc 'echo hi'` and `bash scripts/build.sh` (an in-root script) stay allowed.
- Expansion forms refuse: `$(echo cd) /etc`, `` `echo cd` /etc ``, `x=cd; $x /etc`, `cd${IFS}/etc`, `eval $(printf 'cd /etc')`, `echo` `` `cd /etc` `` and `echo $(cd /etc && cat x)`; `echo $(cd sub && ls)` and `eval 'cd sub'` stay allowed.
- Bash `X+=1 cd /etc` refuses; a `DIRSTACK[...]=` write refuses.
- With `OLDPWD` set outside the root in the bot's environment, `cd -` is refused before spawn; with `CDPATH` set outside the root, `cd sub && pwd` prints the in-root `sub`; a command that sets `CDPATH` to an outside dir and then runs a relative `cd sub` does not print the outside path.
- Scripts a command runs in a shell are checked, with `bad.sh` holding `cd /etc`: `. ./bad.sh`, `source bad.sh`, `sh bad.sh`, `bash -e ./bad.sh arg`, `./bad.sh`, a `#!`-less text file or `#!/usr/bin/env -S bash -e` script run by path, `env X=1 ./bad.sh`, `timeout 5 ./bad.sh`, `exec ./bad.sh`, `find . -exec ./bad.sh \;`, `BASH_ENV=./bad.sh bash -c true`, `bash --rcfile bad.sh -i ok.sh`, `sh < bad.sh`, `sh -s arg < bad.sh`, a nested `. ./nested.sh` and `cd sub && . ./inner.sh` (`cd ../..`) refuse, naming the script (`/etc (in ./bad.sh)`); so do `sh <<'EOF'`+newline+`cd /etc`+newline+`EOF`, an unquoted here-doc whose body expands to `cd /etc` (`c\\d /etc`), `bash <<< 'cd /etc'`, shell input that would expand (`sh <<EOF` with a `$`, `bash <<< "$X"`), `cat bad.sh | sh`, `{ sh; } < bad.sh`, `bash < <(cat bad.sh)`, `. <(cat bad.sh)`, `sh missing.sh`, `sh "$S"`, `. ~/x.sh`, `sh *.sh`, a script over 1 MiB, and a script the command writes (`echo … > gen.sh; sh gen.sh`, `cp bad.sh ok.sh && ./ok.sh`, `for i in 1 2; do sh ok.sh; cp bad.sh ok.sh; done`). `trap 'cd /etc' EXIT`, `trap "$X" EXIT`, `alias c=cd`, `sh -c - 'cd /etc'` and `bash -co pipefail 'cd /etc'` refuse. `sh ok.sh`, `./ok.sh && ./okcd.sh` (`cd sub`), `. ./ok.sh`, `bash scripts/build.sh`, `cd sub && sh ../ok.sh`, `chmod +x ok.sh && ./ok.sh`, `sh <<'EOF'`+newline+`cd sub && pwd`+newline+`EOF`, `bash <<< 'echo hi'`, a binary or `#!/usr/bin/env python3` file run by path, a program the command builds first, and `trap 'rm -f tmp.txt' EXIT` stay allowed. End to end each refused form returns exit 2 with SAFE-3 and nothing is spawned; in-root scripts run.

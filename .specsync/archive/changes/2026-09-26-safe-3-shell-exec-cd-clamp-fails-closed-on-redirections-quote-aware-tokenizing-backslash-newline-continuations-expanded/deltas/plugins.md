---
module: plugins
change: safe-3-shell-exec-cd-clamp-fails-closed-on-redirections-quote-aware-tokenizing-backslash-newline-continuations-expanded
---

# Delta — plugins (SAFE-3 cd clamp fails closed)

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

The clamp SHALL join backslash-newline continuations before tokenizing and
SHALL tokenize with quote awareness — a separator (`;`, `&`, `|`, newline,
`(`, `)`) inside single or double quotes is not a separator, and quotes and
backslash escapes are removed from a word before it is checked. It SHALL find
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
and SHALL analyse the body of each command substitution (`$(…)` and backticks)
as a command, refusing an escaping `cd`/`pushd` found inside. The spawned shell
SHALL run `CDPATH=; readonly CDPATH` before the command and SHALL NOT inherit
`CDPATH` or `OLDPWD` from the bot's environment, so a `CDPATH` set anywhere in
the command (including one built dynamically) cannot redirect a relative `cd`
outside the root; `CDPATH` is therefore NOT refused lexically.

Acceptance Criteria
- Unit fixtures cover allow/refuse cases above.
- Integration: `cd /tmp && …` and `cd ..` from root refuse with exit 2 and SAFE-3 message; `cd sub && …` inside project succeeds when allowlisted.
- Redirection-hidden targets refuse: `>/dev/null cd /etc`, `cd >/dev/null /etc`, `cd</dev/null /etc`, `cd 2>&1 /etc`, `cd -P >/dev/null /etc`; an in-root `cd sub >/dev/null` and `cd 2>&1 sub` stay allowed.
- Quote-aware forms refuse: `X="a b" cd /etc`, `X=';' cd /etc`, `cd "x /../.."`, `cd 'sub dir/../..'`; a backslash-newline `cd` (`c\`+newline+`d /etc`, `cd sub/\`+newline+`../..`) refuses; `cd "sub dir"` and `X=';' cd sub` stay allowed.
- Expansion forms refuse: `$(echo cd) /etc`, `` `echo cd` /etc ``, `x=cd; $x /etc`, `cd${IFS}/etc`, `eval $(printf 'cd /etc')`, `echo` `` `cd /etc` `` and `echo $(cd /etc && cat x)`; `echo $(cd sub && ls)` and `eval 'cd sub'` stay allowed.
- Bash `X+=1 cd /etc` refuses; a `DIRSTACK[...]=` write refuses.
- With `OLDPWD` set outside the root in the bot's environment, `cd -` is refused before spawn; with `CDPATH` set outside the root, `cd sub && pwd` prints the in-root `sub`; a command that sets `CDPATH` to an outside dir and then runs a relative `cd sub` does not print the outside path.

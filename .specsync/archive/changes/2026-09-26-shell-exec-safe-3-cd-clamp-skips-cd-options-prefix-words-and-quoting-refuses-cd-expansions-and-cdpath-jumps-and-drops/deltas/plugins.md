---
module: plugins
change: shell-exec-safe-3-cd-clamp-skips-cd-options-prefix-words-and-quoting-refuses-cd-expansions-and-cdpath-jumps-and-drops
---

# Delta — plugins (shell-exec SAFE-3 clamp bypasses)

## Modified

### REQUIREMENT REQ-plugins-087

`shell-exec` SHALL pin the spawned shell's initial cwd to the plugin cwd
(project root / task worktree) and SHALL refuse, before spawn, any command
whose lexically-resolved `cd` or `pushd` target would land outside that root
(SAFE-3). Refusals include absolute paths outside the root, `..` chains that
escape, `~` / `~user`, `$VAR` references, and bare `cd` (home). Relative `cd`
that stays under root and absolute `cd` under root SHALL be allowed. The clamp
SHALL find a `cd` or `pushd` behind prefix words (`{`, `}`, `!`, `if`, `then`,
`else`, `elif`, `do`, `while`, `until`, `time`, `builtin`, `command`, `eval`,
`function NAME`) and `NAME=value` assignments, SHALL remove quotes and
backslashes from words before checking them, and SHALL skip `cd` / `pushd`
options (`-P`, `-L`, `-e`, `-@`, `-n`, `--`) to reach the real target. It SHALL
refuse `-` (OLDPWD), a target containing `$`, a backtick, a glob or a brace,
and, when the command mentions `CDPATH`, a relative target whose first
component is not `.` or `..`. The spawned shell SHALL NOT inherit `CDPATH` or
`OLDPWD` from the bot's environment.

Acceptance Criteria
- Unit fixtures cover allow/refuse cases above.
- Integration: `cd /tmp && …` and `cd ..` from root refuse with exit 2 and SAFE-3 message; `cd sub && …` inside project succeeds when allowlisted.
- `cd - && ls`, `cd -P / && …`, `{ cd /; …; }`, `if true; then cd /; …; fi` and `CDPATH=/ && cd tmp` refuse; `builtin` / `command` / `eval` / assignment-prefixed and quoted-head `cd /` refuse; `cd -P sub`, `cd -- sub` and `{ cd sub; }` stay allowed.
- With `OLDPWD` set outside the root in the bot's environment, `cd -` is refused before spawn; with `CDPATH` set outside the root, `cd sub && pwd` prints the in-root `sub`.

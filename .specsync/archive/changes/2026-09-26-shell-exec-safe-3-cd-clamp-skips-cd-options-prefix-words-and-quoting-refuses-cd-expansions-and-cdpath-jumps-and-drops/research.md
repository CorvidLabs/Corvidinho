---
change: shell-exec-safe-3-cd-clamp-skips-cd-options-prefix-words-and-quoting-refuses-cd-expansions-and-cdpath-jumps-and-drops
artifact: research
---

# Research

- `/bin/sh` here is dash. dash `cd` takes `-L` / `-P` (and combined `-LP`), honours `--`, maps `-` (also after `--`) to `$OLDPWD`, and uses only the first operand (`cd . /` stays put). bash adds `-e` / `-@`, `pushd -n`, brace expansion and the `function` keyword; the clamp covers both shells.
- POSIX `cd` searches `CDPATH` for a relative operand whose first component is not `.` or `..`, so `cd tmp` with `CDPATH=/` lands in `/tmp` and `cd ./tmp` does not.
- Reserved words (`{ } ! if then else elif do while until`) and `builtin` / `command` / `eval` all still run the `cd` builtin in the current shell; so does a `NAME=value cd …` prefix and a quoted or backslashed `cd` word.
- Globs (`.[.]`, `.?`) match `..` in dash, so a target the shell would expand cannot be judged lexically.
- Callers: only `plugins/shell/commands.ts` uses `firstDisallowedCd`; `stripQuotes` stays exported through `plugins/shell/index.ts`.

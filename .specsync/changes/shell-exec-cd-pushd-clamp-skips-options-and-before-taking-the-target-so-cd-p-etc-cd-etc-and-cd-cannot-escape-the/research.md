---
change: shell-exec-cd-pushd-clamp-skips-options-and-before-taking-the-target-so-cd-p-etc-cd-etc-and-cd-cannot-escape-the
artifact: research
---

# Research

Checked on this box (`/bin/sh` is dash, Bun 1.4.2) and against the bash builtin docs:

- bash `cd` options: `-L`, `-P`, `-e` (with `-P`), `-@` (xattr systems); clusters like `-PL` are accepted; `--` ends options. dash `cd` accepts `-L`, `-P` and `--`. bash `pushd` accepts `-n` (push without changing dir) plus `+N` / `-N` stack rotation.
- `cd -` is `cd "$OLDPWD"`; bash treats a lone `-` as OLDPWD even after `--`.
- `cd` with only options goes to `$HOME`.
- `sh -c 'cd -P /etc && pwd'`, `cd -- /etc`, `cd ""/etc`, `cd \/etc` and `cd "$(echo /etc)"` all print `/etc` under dash.
- `firstDisallowedCd` is only used by `shell-exec` (`plugins/shell/commands.ts`) and re-exported from `plugins/shell/index.ts`.

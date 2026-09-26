---
change: shell-exec-safe-3-cd-clamp-skips-cd-options-prefix-words-and-quoting-refuses-cd-expansions-and-cdpath-jumps-and-drops
artifact: context
---

# Context

Bug report plugins-exec-4 (medium, SAFE-3). `firstDisallowedCd` in
`plugins/shell/clamp.ts` split a command only on `; & | newline ( )`, checked
only fragments whose first word was exactly `cd` or `pushd`, and took the
second word as the target even when it was an option. So `cd - && ls`,
`cd -P / && …`, `{ cd /; …; }`, `if true; then cd /; …; fi` and
`CDPATH=/ && cd tmp` all passed the clamp. `shell-exec` spawned `sh -c` with
`...process.env`, so an `OLDPWD` or `CDPATH` in the bot's environment reached
the child shell. Repro on main: `firstDisallowedCd` returned null for all five
commands; with `OLDPWD` set outside the root, `cd - >/dev/null && pwd` printed
that directory with ok=true; `cd -P / && pwd` and `{ cd /; pwd; }` printed `/`;
an inherited `CDPATH` sent `cd sub` to `$CDPATH/sub`. Probing `/bin/sh` (dash)
also showed `builtin` / `command` / `eval cd /`, `X=1 cd /`, `\cd /`,
`'cd' /`, `cd ".."/..`, `cd .[.]` and `cd .?` leaving the root.

Constraints: minimal bug fix; no new env vars or commands; no package bump or
CHANGELOG/STATUS edits. Command text is untrusted data. The clamp stays
lexical (REQ-plugins-087); a mount or chroot sandbox is out of scope.

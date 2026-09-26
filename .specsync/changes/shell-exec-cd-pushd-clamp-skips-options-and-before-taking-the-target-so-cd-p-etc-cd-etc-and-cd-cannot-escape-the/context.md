---
change: shell-exec-cd-pushd-clamp-skips-options-and-before-taking-the-target-so-cd-p-etc-cd-etc-and-cd-cannot-escape-the
artifact: context
---

# Context

A crash/restart-recovery audit of origin/main found that `firstDisallowedCd` in `plugins/shell/clamp.ts` took the first word after `cd`/`pushd` as the target without skipping options. SAFE-3 ("Shell commands cannot `cd` their way out of the project root to run elsewhere on my machine") was therefore bypassed by any option word: `cd -P /etc` checked `-P` (a relative name under root, allowed) and the shell then ran `cd /etc`.

Repro on main (`firstDisallowedCd(cmd, "/Users/x/proj")` returned `null`, meaning allowed) and with the real `sh` (dash) from a project dir:

- `cd -P /etc && pwd`, `cd -L /etc`, `cd -- /etc`, `cd -PL /etc`, `cd -e /etc`, `cd -@ /etc`, `pushd -n /etc` were allowed; `sh -c 'cd -P /etc && pwd'` and `cd -- /etc` print `/etc`.
- `shell-exec --command "cd -- /etc && pwd"` ran and printed `/etc`.
- `cd -` (OLDPWD) and `cd -P` (options only, so home) were allowed.
- Words the lexical clamp cannot resolve were allowed too: `cd ""/etc`, `cd \/etc`, `cd "$(echo /etc)"`, a backtick substitution, `cd {/etc,}` (bash). Each lands in `/etc` in the shell.

The clamp is lexical by design (no shell evaluation); the fix keeps that and fails closed where the lexer cannot know the target.

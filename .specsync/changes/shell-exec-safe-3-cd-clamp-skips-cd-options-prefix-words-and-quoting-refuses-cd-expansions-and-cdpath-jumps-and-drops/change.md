---
id: shell-exec-safe-3-cd-clamp-skips-cd-options-prefix-words-and-quoting-refuses-cd-expansions-and-cdpath-jumps-and-drops
state: implementing
type: bug_fix
base_commit: cfcf2b7c6ab71ed46ce4f319969c26bc3c599c0f
---

# Shell-exec SAFE-3 cd clamp skips cd options, prefix words and quoting, refuses cd -, expansions and CDPATH jumps, and drops inherited CDPATH/OLDPWD so shell-exec cannot run outside the project root

## Intent

Shell-exec SAFE-3 cd clamp skips cd options, prefix words and quoting, refuses cd -, expansions and CDPATH jumps, and drops inherited CDPATH/OLDPWD so shell-exec cannot run outside the project root

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- shell-exec refuses (exit 2, SAFE-3, before spawn) cd - / cd -- -, cd -P / (and other option forms), { cd /; }, if/then/else/do/while/! cd /, builtin/command/eval cd /, NAME=value cd /, quoted or backslashed cd heads, quote-concatenated .. targets, targets with $VAR, backticks, globs or braces anywhere, and relative targets when the command sets CDPATH; an inherited CDPATH or OLDPWD is not passed to the child shell, so a relative cd sub stays under the root; in-root forms (cd -P sub, cd -- sub, { cd sub; }, quoted sub dir) still run

## No-spec Rationale

Not applicable

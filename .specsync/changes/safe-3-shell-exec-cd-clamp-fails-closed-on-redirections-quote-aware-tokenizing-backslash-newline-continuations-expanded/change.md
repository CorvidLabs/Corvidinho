---
id: safe-3-shell-exec-cd-clamp-fails-closed-on-redirections-quote-aware-tokenizing-backslash-newline-continuations-expanded
state: implementing
type: bug_fix
base_commit: 05b269af23ea2be9e9c41966f6cf9ee41dfeac02
---

# SAFE-3 shell-exec cd clamp fails closed on redirections, quote-aware tokenizing, backslash-newline continuations, expanded command words and command substitutions, and moves CDPATH protection to a runtime readonly guard

## Intent

SAFE-3 shell-exec cd clamp fails closed on redirections, quote-aware tokenizing, backslash-newline continuations, expanded command words and command substitutions, and moves CDPATH protection to a runtime readonly guard

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- shell-exec refuses before spawn (exit 2, SAFE-3) every reviewed escape: redirection-hidden targets (>/dev/null cd /etc, cd >/dev/null /etc, cd 2>&1 /etc, cd</dev/null /etc); quoted separators and quoted escaping targets (X="a b" cd /etc, X=';' cd /etc, cd "x /../.."); backslash-newline continuations (c\<nl>d /etc, cd sub/\<nl>../..); expanded command words and eval with expansion ($(echo cd) /etc, $x /etc, cd${IFS}/etc, eval $(printf 'cd /etc')); command substitutions whose body escapes the root (echo `cd /etc`, echo $(cd /etc && cat x)); bash X+= assignment prefix and DIRSTACK writes. In-root forms still run (cd sub with redirections/quoting/continuations, echo $(cd sub && ...), eval 'cd sub'). CDPATH is no longer refused lexically; the spawned shell runs CDPATH=; readonly CDPATH and does not inherit CDPATH/OLDPWD, so a dynamically set CDPATH cannot redirect a relative cd outside the root. tsc --noEmit and bun test green; new tests fail on the pre-fix clamp.

## No-spec Rationale

Not applicable

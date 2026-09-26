---
module: plugins
change: shell-exec-cd-pushd-clamp-skips-options-and-before-taking-the-target-so-cd-p-etc-cd-etc-and-cd-cannot-escape-the
---

# Delta — plugins (shell-exec clamp skips cd/pushd options)

## Added

### REQUIREMENT REQ-plugins-341

The `shell-exec` SAFE-3 clamp SHALL skip `cd`/`pushd` option words (any
word starting with `-`, e.g. `-P`, `-L`, `-e`, `-@`, `-PL`, `-n`) and a
terminating `--` before taking the target, and SHALL apply the existing
lexical root check to that target. It SHALL fail closed (refuse before
spawn) on a lone `-` target (OLDPWD), on options with no target (home),
and on an option or target word that still contains shell quoting or
expansion characters (double or single quote, backtick, backslash, `$`,
`{`, `}`) after one outer quote pair is stripped. Option forms whose
target stays under the project root SHALL be allowed.

Acceptance Criteria
- `cd -P /etc`, `cd -L /etc`, `cd -- /etc`, `cd -PL /etc`, `cd -e /etc`, `cd -@ /etc` and `pushd -n /etc` refuse with the outside target.
- `cd -`, `cd -- -`, `cd -P` and `cd --` refuse.
- `cd ""/etc`, `cd \/etc` and `cd "$(echo /etc)"` refuse.
- `shell-exec` with `cd -P /etc && pwd` or `--command "cd -- /etc && pwd"` returns exit 2 with a SAFE-3 message and does not spawn.
- `cd sub/dir`, `cd -P sub/dir` and `cd -- sub` inside the root stay allowed.

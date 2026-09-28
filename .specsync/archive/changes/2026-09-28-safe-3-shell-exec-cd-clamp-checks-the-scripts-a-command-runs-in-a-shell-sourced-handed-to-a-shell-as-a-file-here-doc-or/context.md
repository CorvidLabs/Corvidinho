---
change: safe-3-shell-exec-cd-clamp-checks-the-scripts-a-command-runs-in-a-shell-sourced-handed-to-a-shell-as-a-file-here-doc-or
artifact: context
---

# Context

Follow-up to #226 (REQ-plugins-087, SAFE-3 in `hi/safe.md`: shell commands
cannot `cd` their way out of the project root). #226 made the clamp read a
command's own text the way dash and bash do, and its handoff listed what a
lexical check of that text still could not see: a `cd` inside a script the
command runs. `. ./x.sh`, `sh x.sh`, `./x.sh`, `sh < x.sh`, a here-doc fed to
`sh`, `cat x.sh | sh` and `bash < <(…)` all ran a `cd /etc` from a file or
stream while `firstDisallowedCd` returned null. The requester was offered three ways
(refuse those forms, read the scripts at check time, or document them) plus
interpreters (`python3 -c` …), and chose: check script contents at check time,
fail closed, and leave interpreters documented as residual risk.

Probing the same area found four more gaps in #226's code, fixed here as the
same bug class (code the shell runs that the clamp never read):

- `trap 'cd /etc; …' EXIT` runs its action as a command (dash and bash).
- `alias c=cd` then `c /etc` on a later line runs `cd /etc` (dash and
  `bash --posix` expand aliases non-interactively).
- `sh -c - 'cd /etc'`: `-` ends the options like `--`; the clamp took `-` as
  the `-c` string.
- `bash -co pipefail 'cd /etc'`: `o` in the cluster takes `pipefail`; the
  clamp took `pipefail` as the `-c` string.

Constraints: bug fix only; no new flag, env var, command or package bump; no
CHANGELOG/STATUS edit. Command text and project files are untrusted. The clamp
stays lexical (REQ-plugins-087); a mount / namespace sandbox is out of scope.
The branch also carries the busy-lock test-timeout change (test-only).

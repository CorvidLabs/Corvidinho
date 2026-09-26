---
change: shell-exec-cd-pushd-clamp-skips-options-and-before-taking-the-target-so-cd-p-etc-cd-etc-and-cd-cannot-escape-the
artifact: plan
---

# Plan

1. Regression tests in `tests/shell.plugins.test.ts` for each option form (`-P`, `-L`, `--`, `-PL`, `-e`, `-@`, quoted `"-P"`, `pushd -n` / `pushd --`), lone `-`, options with no target, unparseable words, integration refusals (`cd -P /etc && pwd`, `--command "cd -- /etc && pwd"`, `cd -L /etc && pwd`), and unchanged allowed cases (`cd sub/dir`, `cd -P sub/dir`, `cd -- sub`, and `cd -P sub && cat marker.txt` run for real). Confirm they fail on main.
2. Add `cdArgsOffending` to `plugins/shell/clamp.ts` and route `firstDisallowedCd` through it.
3. Added REQ-plugins-341 (cd/pushd options and `--` do not bypass the SAFE-3 clamp; fail closed on `-`, options-only and unparseable words).

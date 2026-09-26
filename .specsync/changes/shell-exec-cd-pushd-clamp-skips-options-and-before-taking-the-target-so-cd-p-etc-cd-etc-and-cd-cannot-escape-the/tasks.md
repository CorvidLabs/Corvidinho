---
change: shell-exec-cd-pushd-clamp-skips-options-and-before-taking-the-target-so-cd-p-etc-cd-etc-and-cd-cannot-escape-the
artifact: tasks
---

# Tasks

- [x] Regression tests fail before the fix (option forms, `-`, options-only, unparseable words and the `shell-exec` integration refusals were allowed on main).
- [x] `cdArgsOffending` skips cd/pushd options and `--`, refuses `-`, options-only and unparseable words; `firstDisallowedCd` uses it.
- [x] Regression tests pass after the fix; existing allow/refuse clamp tests and the `cd sub` integration test are unchanged.
- [x] Delta: Added REQ-plugins-341.

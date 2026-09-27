---
change: every-package-version-gets-a-vx-y-z-tag-and-github-release-from-ci-release-yml-tags-each-version-s-bump-commit-on
artifact: tasks
---

# Tasks

- [x] Helpers + tests.
- [x] Workflow rewrite + shape test.
- [x] Docs.
- [x] Adversarial review fixes (catch-up so v0.0.29 gets range v0.0.28..v0.0.29, bad-ref failure, dispatch newline/comma parsing, version-format guard, bump-commit warning, concurrent-tag fallback, deletion/non-main dispatch skip, Latest repair, `--match v[0-9]*`).
After merge (outside this change): confirm the push run tagged the 12 versions and created their Releases.

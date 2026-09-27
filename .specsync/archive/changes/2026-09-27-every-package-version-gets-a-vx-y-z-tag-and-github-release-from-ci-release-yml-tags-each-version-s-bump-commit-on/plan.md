---
change: every-package-version-gets-a-vx-y-z-tag-and-github-release-from-ci-release-yml-tags-each-version-s-bump-commit-on
artifact: plan
---

# Plan

1. Helpers + unit tests (temp git repo, strict mode).
2. release.yml rewrite + shape test (triggers, idempotency, no `${{ }}` in run blocks, no force/delete).
3. Docs: STATUS Releases row, BOX-UPDATE, UPDATE.
4. Three-lens adversarial review (Actions semantics, bash strictness, safety); fixes applied.
5. After merge: check the push run tagged the 12 versions and created Releases.

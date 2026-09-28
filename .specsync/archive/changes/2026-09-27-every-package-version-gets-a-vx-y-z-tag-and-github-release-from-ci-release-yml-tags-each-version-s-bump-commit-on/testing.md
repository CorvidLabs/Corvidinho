---
change: every-package-version-gets-a-vx-y-z-tag-and-github-release-from-ci-release-yml-tags-each-version-s-bump-commit-on
artifact: testing
---

# Testing

- `bun test tests/update-helpers.test.ts`: 52 pass. On main's helpers and workflow the new tests fail.
- Planting `${{ inputs.versions }}` in the last `run:` block fails the shape test.
- Dry run on the real repo: `release_push_targets` for main 0.0.29 yields exactly v0.0.12, v0.0.13, v0.0.16, v0.0.18, v0.0.21, v0.0.23..v0.0.29 at their bump commits; the bootstrap 0.0.1 stays untagged.
- Full `bun test`, `specsync change audit`, `specsync check --require-coverage 100`, `fledge lanes run verify --non-interactive`.

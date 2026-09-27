---
id: every-package-version-gets-a-vx-y-z-tag-and-github-release-from-ci-release-yml-tags-each-version-s-bump-commit-on
state: implementing
type: operations
base_commit: 9f3fbb1a2e188c50a8f2d957a2c32aac04945f6e
---

# Every package version gets a vX.Y.Z tag and GitHub Release from CI: release.yml tags each version's bump commit on pushes to main (catching up untagged versions), releases hand-pushed tags, and backfills on dispatch

## Intent

every package version gets a vX.Y.Z tag and GitHub Release from CI: release.yml tags each version's bump commit on pushes to main (catching up untagged versions), releases hand-pushed tags, and backfills on dispatch

## Affected Canonical Specs

- None

## Acceptance Criteria

- After merge, the push-to-main release run tags v0.0.12, v0.0.13, v0.0.16, v0.0.18, v0.0.21 and v0.0.23..v0.0.29 at each version's bump commit (package_version_commits) and creates their Releases oldest first with ranges from the previous vX.Y.Z tag, v0.0.29 marked Latest; existing tags and Releases are untouched; later pushes that do not bump the version are no-ops; tests/update-helpers.test.ts covers the helpers under set -euo pipefail and the workflow's triggers, idempotency and no-injection shape.

## No-spec Rationale

CI release automation requested by Leif ('make sure ur tagging'): the workflow file and the updater helper library are not owned by a canonical spec, and no product behaviour changes.

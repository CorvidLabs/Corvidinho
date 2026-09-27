---
change: every-package-version-gets-a-vx-y-z-tag-and-github-release-from-ci-release-yml-tags-each-version-s-bump-commit-on
artifact: design
---

# Design

- `scripts/lib/update-helpers.sh` gains pure, testable helpers:
  - `package_version_at`
  - `package_version_commits`: the first commit carrying each version, oldest first.
  - `release_push_targets`: catch-up from the oldest existing tag up to main's version.
  - `release_dispatch_targets`: validated backfill list.
  - `release_tag_subject`
  - `release_notes`: CHANGELOG section, commits since the previous vX.Y.Z tag, updater line.
- `.github/workflows/release.yml` triggers:
  - Push to main: catch-up tags plus Releases.
  - `v*` tag push: Release only for vX.Y.Z.
  - `workflow_dispatch` on main: backfill.
- The job skips deletions. Event data reaches the shell only through `env`.
- Existing tags and Releases are never moved, edited or deleted. The only edit is marking main's version Latest.
- A concurrent tag push by a person is kept.
- The stale release-note lines are dropped: in-memory sessions, and the hard-coded slash list.

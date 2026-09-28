# Lesson bundle — every-package-version-gets-a-vx-y-z-tag-and-github-release-from-ci-release-yml-tags-each-version-s-bump-commit-on

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Every package version gets a vX.Y.Z tag and GitHub Release from CI: release.yml tags each version's bump commit on pushes to main (catching up untagged versions), releases hand-pushed tags, and backfills on dispatch
- **Kind**: Operations
- **Paths**: .github/workflows/release.yml, scripts/lib/update-helpers.sh, tests/update-helpers.test.ts, STATUS.md, docs/BOX-UPDATE.md, docs/UPDATE.md
- **Acceptance**: After merge, the push-to-main release run tags v0.0.12, v0.0.13, v0.0.16, v0.0.18, v0.0.21 and v0.0.23..v0.0.29 at each version's bump commit (package_version_commits) and creates their Releases oldest first with ranges from the previous vX.Y.Z tag, v0.0.29 marked Latest; existing tags and Releases are untouched; later pushes that do not bump the version are no-ops; tests/update-helpers.test.ts covers the helpers under set -euo pipefail and the workflow's triggers, idempotency and no-injection shape.

## Evidence

- Verification commit: `6506a64c213f99a7827ec414de6a6aff341230e9`
- Base commit: `9f3fbb1a2e188c50a8f2d957a2c32aac04945f6e`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

Twelve package versions had no tag and no GitHub Release: 0.0.12, 0.0.13, 0.0.16, 0.0.18,
0.0.21 and 0.0.23–0.0.29. The old `release.yml` only ran on a hand-pushed `v*` tag, and agent
sessions cannot push tags: the session git proxy answers 403, which is an org policy, not a
fault to work around. Leif asked for tagging to be sure ("make sure ur tagging!!").

The fix tags from CI with `GITHUB_TOKEN`. A tag pushed that way starts no other workflow run,
so the same job creates the Release. Existing remote tags match each version's bump commit,
except v0.0.9, which sits 4 commits after its bump (#140). The workflow never moves an
existing tag, so it only warns about v0.0.9.

## From the change's design.md

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

## From the change's testing.md

# Testing

- `bun test tests/update-helpers.test.ts`: 52 pass. On main's helpers and workflow the new tests fail.
- Planting `${{ inputs.versions }}` in the last `run:` block fails the shape test.
- Dry run on the real repo: `release_push_targets` for main 0.0.29 yields exactly v0.0.12, v0.0.13, v0.0.16, v0.0.18, v0.0.21, v0.0.23..v0.0.29 at their bump commits; the bootstrap 0.0.1 stays untagged.
- Full `bun test`, `specsync change audit`, `specsync check --require-coverage 100`, `fledge lanes run verify --non-interactive`.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.

---
id: updater-changelog-extraction-stays-linear-on-a-large-utf-8-section-the-release-notes-check-no-longer-takes-seconds
state: implementing
type: bug_fix
base_commit: ba1f819eab26eb829d1f0018240eac860cdf09d2
---

# Updater changelog extraction stays linear on a large UTF-8 section (the release notes check no longer takes seconds)

## Intent

Updater changelog extraction stays linear on a large UTF-8 section (the release notes check no longer takes seconds)

## Affected Canonical Specs

- None

## Acceptance Criteria

- extract_changelog_section returns the same section as before; on a 400 KB UTF-8 section under LC_ALL=C.UTF-8 it finishes in under 2 s (tests/update-helpers.test.ts), and the 0.0.34 section extracts well inside the 5 s test timeout on CI

## No-spec Rationale

Performance fix in the bash updater helper: extract_changelog_section's emptiness check used ${out// }, which is quadratic in a UTF-8 locale; replaced by an equivalent linear regex. Behaviour and output are unchanged, so no requirement text changes.

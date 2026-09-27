---
id: bump-version-fixtures-to-0-0-25-for-slash-ask-7-package-bump
state: archived
type: bug_fix
base_commit: 8a337299ee6b396473f43fb5ed8c81de14e025ff
---

# Bump version fixtures to 0.0.25 for slash ASK-7 package bump

## Intent

Bump version fixtures to 0.0.25 for slash ASK-7 package bump

## Affected Canonical Specs

- None

## Acceptance Criteria

- tests/version.test.ts and tests/update-helpers.test.ts assert package 0.0.25 and extract CHANGELOG 0.0.25 section with /session /work ASK-7 bullets; bun test both files green.

## No-spec Rationale

Package bump to 0.0.25 already HI/REQ covered by slash ASK-7 archive; only version fixture asserts need a covering change for SpecSync audit

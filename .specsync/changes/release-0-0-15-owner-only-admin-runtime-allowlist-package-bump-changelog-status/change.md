---
id: release-0-0-15-owner-only-admin-runtime-allowlist-package-bump-changelog-status
state: implementing
type: operations
base_commit: 42370b6d06944cc7b01fab42b1c8fdce74efb390
---

# Release 0.0.15 owner-only /admin runtime allowlist package bump changelog status

## Intent

release 0.0.15 owner-only /admin runtime allowlist package bump changelog status

## Affected Canonical Specs

- `cli`

## Acceptance Criteria

- package.json is 0.0.15; CLI version and Discord presence report v0.0.15 after bridge restart; CHANGELOG has a 0.0.15 section covering /admin ADMIN-1..4 (#147) that extract_changelog_section finds; STATUS records #43/#147 done; release.yml slash list includes /admin; version and update-helpers tests pass.

## No-spec Rationale

Package bump to 0.0.15 for merged #147 ADMIN slash; CHANGELOG/STATUS/tests + release.yml slash list include /admin. No living-spec REQ text change (REQ-cli-002 already reads package.json).

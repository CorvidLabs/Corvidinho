---
id: web-fetch-htmltotext-strips-tags-to-a-capped-fixpoint-so-split-tags-cannot-reassemble-codeql-incomplete-multi-character
state: implementing
type: bug_fix
base_commit: 254350444f30d45e68618de9c38276f6ff4eaba4
---

# Web-fetch htmlToText strips tags to a capped fixpoint so split tags cannot reassemble (CodeQL incomplete multi-character sanitization on #148)

## Intent

web-fetch htmlToText strips tags to a capped fixpoint so split tags cannot reassemble (CodeQL incomplete multi-character sanitization on #148)

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- split/nested tags never reassemble into markup; deeply nested hostile markup stays linear and tag-free

## No-spec Rationale

Not applicable

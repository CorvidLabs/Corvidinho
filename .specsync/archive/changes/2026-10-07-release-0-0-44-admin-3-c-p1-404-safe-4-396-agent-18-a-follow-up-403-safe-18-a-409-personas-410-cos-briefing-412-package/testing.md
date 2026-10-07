---
change: release-0-0-44-admin-3-c-p1-404-safe-4-396-agent-18-a-follow-up-403-safe-18-a-409-personas-410-cos-briefing-412-package
artifact: testing
---

# Testing

- `tests/version.test.ts` — package.json and VERSION are `0.0.44`.
- `tests/update-helpers.test.ts` — `extract_changelog_section` finds 0.0.44; package.json is 0.0.44.

## Requirement evidence

| Requirement | Evidence |
|---|---|
| REQ-cli-436 | `package.json` version `0.0.44`; `tests/version.test.ts`; `tests/update-helpers.test.ts` (`extract_changelog_section` 0.0.44 + package.json is 0.0.44); CHANGELOG `## 0.0.44` |

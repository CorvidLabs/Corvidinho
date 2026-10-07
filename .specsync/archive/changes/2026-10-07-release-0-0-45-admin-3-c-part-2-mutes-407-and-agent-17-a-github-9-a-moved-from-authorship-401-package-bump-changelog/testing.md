---
change: release-0-0-45-admin-3-c-part-2-mutes-407-and-agent-17-a-github-9-a-moved-from-authorship-401-package-bump-changelog
artifact: testing
---

# Testing

- `tests/version.test.ts` — package.json and VERSION are `0.0.45`.
- `tests/update-helpers.test.ts` — `extract_changelog_section` finds 0.0.45; package.json is 0.0.45.

## Requirement evidence

| Requirement | Evidence |
|---|---|
| REQ-cli-437 | `package.json` version `0.0.45`; `tests/version.test.ts`; `tests/update-helpers.test.ts` (`extract_changelog_section` 0.0.45 + package.json is 0.0.45); CHANGELOG `## 0.0.45` |

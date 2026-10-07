---
change: release-0-0-47-session-5-5-a-per-model-window-condense-405-and-session-3-b-new-topic-393-package-bump-changelog-fold
artifact: testing
---

# Testing

- `tests/version.test.ts` — package.json and VERSION are `0.0.47`.
- `tests/update-helpers.test.ts` — `extract_changelog_section` finds 0.0.47; package.json is 0.0.47.

## Requirement evidence

| Requirement | Evidence |
|---|---|
| REQ-cli-439 | `package.json` version `0.0.47`; `tests/version.test.ts`; `tests/update-helpers.test.ts`; CHANGELOG `## 0.0.47` |

---
change: updater-changelog-extraction-stays-linear-on-a-large-utf-8-section-the-release-notes-check-no-longer-takes-seconds
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| (no spec change: updater helper performance) | `tests/update-helpers.test.ts` "extract_changelog_section stays fast on a large UTF-8 section" | With the old helper the test times out (5005 ms). With the fix it passes, and all update-helpers tests pass, including every "extract_changelog_section finds <version>" test with 0.0.34. |

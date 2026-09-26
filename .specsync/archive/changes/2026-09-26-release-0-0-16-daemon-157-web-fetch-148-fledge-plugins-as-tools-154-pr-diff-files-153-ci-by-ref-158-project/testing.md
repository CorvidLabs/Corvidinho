---
change: release-0-0-16-daemon-157-web-fetch-148-fledge-plugins-as-tools-154-pr-diff-files-153-ci-by-ref-158-project
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-017` | `tests/version.test.ts`, `tests/update-helpers.test.ts` | package + VERSION are 0.0.16; the updater changelog helper extracts the 0.0.16 section exactly. |

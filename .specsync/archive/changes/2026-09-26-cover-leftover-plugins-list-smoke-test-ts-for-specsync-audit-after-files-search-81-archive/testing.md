---
change: cover-leftover-plugins-list-smoke-test-ts-for-specsync-audit-after-files-search-81-archive
artifact: testing
---

# Testing

## Local gates

- `bun test tests/plugins.list.smoke.test.ts`
- `specsync change audit` green

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-plugins-081 | plugins.list.smoke.test.ts asserts files-read/write + search-grep |

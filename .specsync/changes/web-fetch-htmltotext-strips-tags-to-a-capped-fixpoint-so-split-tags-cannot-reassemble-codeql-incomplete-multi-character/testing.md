---
change: web-fetch-htmltotext-strips-tags-to-a-capped-fixpoint-so-split-tags-cannot-reassemble-codeql-incomplete-multi-character
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-111` | `tests/web.fetch.test.ts` | split tags never reassemble; 200k-deep nesting finishes under 2s with no tag left. |

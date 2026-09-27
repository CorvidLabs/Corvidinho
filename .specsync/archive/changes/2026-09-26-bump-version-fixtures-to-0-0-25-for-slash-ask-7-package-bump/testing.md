---
change: bump-version-fixtures-to-0-0-25-for-slash-ask-7-package-bump
artifact: testing
---

# Testing

```bash
bun test tests/version.test.ts tests/update-helpers.test.ts
```

Evidence: package.json is 0.0.25; extract_changelog_section finds 0.0.25 with DISCORD-ASK-7 /session /work.

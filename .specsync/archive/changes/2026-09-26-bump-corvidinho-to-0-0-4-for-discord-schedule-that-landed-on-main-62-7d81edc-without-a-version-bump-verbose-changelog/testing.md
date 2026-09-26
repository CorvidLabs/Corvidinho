---
change: bump-corvidinho-to-0-0-4-for-discord-schedule-that-landed-on-main-62-7d81edc-without-a-version-bump-verbose-changelog
artifact: testing
---

# Testing

- `tests/version.test.ts` expects package VERSION 0.0.4
- `tests/update-helpers.test.ts` package.json 0.0.4 + changelog section extract
- slash/schedule/presence fixtures use 0.0.4 where they assert package version
- `fledge lanes run verify --non-interactive` green

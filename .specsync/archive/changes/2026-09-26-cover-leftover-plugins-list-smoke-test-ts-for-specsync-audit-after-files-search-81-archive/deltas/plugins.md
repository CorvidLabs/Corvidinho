---
module: plugins
change: cover-leftover-plugins-list-smoke-test-ts-for-specsync-audit-after-files-search-81-archive
---

# Delta — plugins (cover smoke list)

## Modified

### REQUIREMENT REQ-plugins-081

The system SHALL register typed file/search plugins `files-read`, `files-write`,
`files-edit`, `files-glob`, `files-list`, `files-delete`, and `search-grep`
(PLUGIN-1). Writes/edits/deletes SHALL declare `minTier: 2` (code).
`files-delete` SHALL be `dangerous: true` (PLUGIN-2).

Acceptance Criteria
- `plugins list` includes the seven command names with correct dangerous/minTier.
- `tests/plugins.list.smoke.test.ts` asserts files-read, files-write, search-grep.

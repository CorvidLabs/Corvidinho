---
module: cli
change: cover-leftover-update-helpers-0-0-9-changelog-fixture-for-specsync-audit-after-shell-exec-archive
---

# Delta — cli (cover update-helpers 0.0.9)

## Modified

### REQUIREMENT REQ-cli-015

The project SHALL ship package version `0.0.9` with shell-exec + SAFE-3
(issue #83 / PLUGIN-1,2 / SAFE-3). CLI `version` and Discord presence
(DISCORD-12) report `0.0.9` after bridge update. CHANGELOG SHALL include
verbose 0.0.9 notes. STATUS.md SHALL mark #83 done.

Acceptance Criteria
- `package.json` version is `0.0.9`.
- CLI `version` prints `0.0.9`.
- CHANGELOG has a 0.0.9 section covering shell-exec + SAFE-3.
- STATUS ROADMAP marks #83 done; next = remaining M3 plugins (git, …).
- `tests/update-helpers.test.ts` asserts `extract_changelog_section` finds 0.0.9 with shell-exec + SAFE-3.

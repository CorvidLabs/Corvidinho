---
module: cli
change: plugin-file-and-search-tools-with-protected-paths-plugin-1-2-safe-2-issue-81
---

# Delta — cli (package 0.0.6 / #81)

## Modified

### SPEC SECTION Change Log

| 2026-09-26 | files-search-plugins-issue-81: package 0.0.6 with files/search + SAFE-2 (REQ-cli-013) |

## Added

### REQUIREMENT REQ-cli-013

The project SHALL ship package version `0.0.6` with files/search plugins and
SAFE-2 protected paths (issue #81 / PLUGIN-1,2 / SAFE-2). CLI `version` and
Discord presence (DISCORD-12) report `0.0.6` after bridge update. CHANGELOG
SHALL include verbose 0.0.6 notes. STATUS.md SHALL mark #81 cut-order done.

Acceptance Criteria
- `package.json` version is `0.0.6`.
- CLI `version` prints `0.0.6`.
- CHANGELOG has a 0.0.6 section covering files/search + SAFE-2.
- STATUS ROADMAP marks #81 done; next = M3 plugins.

---
module: cli
change: shell-exec-plugin-with-safe-3-project-root-cwd-clamp-plugin-1-2-safe-3-issue-83-package-0-0-9
---

# Delta — cli (package 0.0.9 / #83)

## Modified

### SPEC SECTION Change Log

| 2026-09-26 | shell-exec-safe-3-issue-83: package 0.0.9 with shell-exec + SAFE-3 (REQ-cli-015) |

## Added

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

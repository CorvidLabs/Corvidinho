---
module: cli
change: release-0-0-12-typed-git-tools-145-and-durable-watch-sessions-142-package-0-0-12-changelog-status
---

# Delta — cli (release 0.0.12)

## Added

### REQUIREMENT REQ-cli-016

The project SHALL ship package version `0.0.12` covering the typed git tools
(#145) and durable WATCH sessions (#142, schema v6). CLI `version` and Discord
presence (DISCORD-12) report `0.0.12` after a restart. CHANGELOG SHALL include
verbose 0.0.12 notes with the restart step. STATUS.md SHALL record the slices.

Acceptance Criteria
- `package.json` version is `0.0.12`.
- CLI `version` prints `0.0.12`.
- CHANGELOG has a 0.0.12 section that the updater's changelog helper extracts exactly.
- STATUS records #145 and #142.

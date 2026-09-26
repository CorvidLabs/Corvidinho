---
module: cli
change: release-0-0-18-ask-human-owner-ping-autonomous-gate-delegate
---

# Delta — cli (release 0.0.18)

## Added

### REQUIREMENT REQ-cli-019

The project SHALL ship package version `0.0.18` (ask-human + owner ping, autonomous gate + delegate). CLI `version` and Discord presence (DISCORD-12) report `0.0.18` after a restart. CHANGELOG SHALL include verbose 0.0.18 notes.

Acceptance Criteria
- `package.json` version is `0.0.18`.
- CLI `version` prints `0.0.18`.
- CHANGELOG has a 0.0.18 section that the updater's changelog helper extracts exactly.

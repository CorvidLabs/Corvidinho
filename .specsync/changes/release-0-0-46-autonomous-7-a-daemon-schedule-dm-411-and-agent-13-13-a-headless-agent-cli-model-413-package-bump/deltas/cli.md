---
module: cli
change: release-0-0-46-autonomous-7-a-daemon-schedule-dm-411-and-agent-13-13-a-headless-agent-cli-model-413-package-bump
---

# Delta — cli (release 0.0.46)

## Added

### REQUIREMENT REQ-cli-438

The project SHALL ship package version `0.0.46` (AUTONOMOUS-7.a daemon schedule DM, AGENT-13/13.a headless agent CLI model after v0.0.45). CLI `version` and Discord presence (DISCORD-12) report `0.0.46` after a restart. CHANGELOG SHALL include verbose 0.0.46 notes covering #411 / #413 (tip-orphans #425 / #426).

Acceptance Criteria
- `package.json` version is `0.0.46`.
- CLI `version` prints `0.0.46`.
- CHANGELOG has a 0.0.46 section that the updater's changelog helper extracts exactly.

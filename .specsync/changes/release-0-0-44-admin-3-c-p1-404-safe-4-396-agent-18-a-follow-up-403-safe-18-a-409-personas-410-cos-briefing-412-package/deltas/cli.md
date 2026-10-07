---
module: cli
change: release-0-0-44-admin-3-c-p1-404-safe-4-396-agent-18-a-follow-up-403-safe-18-a-409-personas-410-cos-briefing-412-package
---

# Delta — cli (release 0.0.44)

## Added

### REQUIREMENT REQ-cli-436

The project SHALL ship package version `0.0.44` (ADMIN-3.c part 1, SAFE-4 store guard, AGENT-18.a glob/brace follow-up, SAFE-18.a memory cards, personas, COS briefing behavior after v0.0.43). CLI `version` and Discord presence (DISCORD-12) report `0.0.44` after a restart. CHANGELOG SHALL include verbose 0.0.44 notes covering #404 / #396 / #403 / #409 / #410 / #412 (tip-orphans #417 / #418).

Acceptance Criteria
- `package.json` version is `0.0.44`.
- CLI `version` prints `0.0.44`.
- CHANGELOG has a 0.0.44 section that the updater's changelog helper extracts exactly.

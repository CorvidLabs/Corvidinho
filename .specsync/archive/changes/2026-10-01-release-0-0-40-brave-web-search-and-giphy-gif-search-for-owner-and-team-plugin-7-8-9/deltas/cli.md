---
module: cli
change: release-0-0-40-brave-web-search-and-giphy-gif-search-for-owner-and-team-plugin-7-8-9
---

# Delta — cli (release 0.0.40)

## Added

### REQUIREMENT REQ-cli-432

The project SHALL ship package version `0.0.40` (Brave web-search and GIPHY gif-search for owner and team, PLUGIN-7/8/9). CLI `version` and Discord presence (DISCORD-12) report `0.0.40` after a restart. CHANGELOG SHALL include verbose 0.0.40 notes covering #326 and #331.

Acceptance Criteria
- `package.json` version is `0.0.40`.
- CLI `version` prints `0.0.40`.
- CHANGELOG has a 0.0.40 section that the updater's changelog helper extracts exactly.

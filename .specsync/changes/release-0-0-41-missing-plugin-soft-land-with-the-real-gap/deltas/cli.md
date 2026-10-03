---
module: cli
change: release-0-0-41-missing-plugin-soft-land-with-the-real-gap
---

# Delta — cli (release 0.0.41)

## Added

### REQUIREMENT REQ-cli-433

The project SHALL ship package version `0.0.41` (missing-plugin soft-land with the real gap, #360). CLI `version` and Discord presence (DISCORD-12) report `0.0.41` after a restart. CHANGELOG SHALL include verbose 0.0.41 notes covering #360 (real gap, no vague clarify, no invented Tenor, HI/PR cited only when lookup returns it, community stays read/chat) and noting that the #358 fledge-gif prefer path is already on the previous tip and dogfood still needs GIPHY_API_KEY.

Acceptance Criteria
- `package.json` version is `0.0.41`.
- CLI `version` prints `0.0.41`.
- CHANGELOG has a 0.0.41 section that the updater's changelog helper extracts exactly.

---
module: cli
change: release-0-0-48-safe-8-8-a-flat-priced-spend-card-436-autonomy-5-thin-words-and-emoji-437-and-identity-6-allowlist-file
---

# Delta — cli (release 0.0.48)

## Added

### REQUIREMENT REQ-cli-440

The project SHALL ship package version `0.0.48` (SAFE-8/8.a flat-priced spend card, AUTONOMY-5 thin words and emoji, IDENTITY-6 allowlist file after v0.0.47). CLI `version` and Discord presence (DISCORD-12) report `0.0.48` after a restart. CHANGELOG SHALL include verbose 0.0.48 notes covering #436 / #437 / #435.

Acceptance Criteria
- `package.json` version is `0.0.48`.
- CLI `version` prints `0.0.48`.
- CHANGELOG has a 0.0.48 section that the updater's changelog helper extracts exactly.

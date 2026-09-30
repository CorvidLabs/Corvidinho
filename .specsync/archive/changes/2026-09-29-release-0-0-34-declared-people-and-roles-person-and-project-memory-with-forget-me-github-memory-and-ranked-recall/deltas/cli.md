---
module: cli
change: release-0-0-34-declared-people-and-roles-person-and-project-memory-with-forget-me-github-memory-and-ranked-recall
---

# Delta — cli (release 0.0.34)

## Added

### REQUIREMENT REQ-cli-425

The project SHALL ship package version `0.0.34` (declared people and roles, person and project memory with forget-me, GitHub memory and ranked recall, condensed chats kept 30 days and resumed after the TTL (schema v13), answer footer and fence-safe 2000-char splits, nightly backup, discord-send-file, private Answer form, injection guards, W12 sweep). CLI `version` and Discord presence (DISCORD-12) report `0.0.34` after a restart. CHANGELOG SHALL include verbose 0.0.34 notes.

Acceptance Criteria
- `package.json` version is `0.0.34`.
- CLI `version` prints `0.0.34`.
- CHANGELOG has a 0.0.34 section that the updater's changelog helper extracts exactly.

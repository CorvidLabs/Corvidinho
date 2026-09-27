---
module: cli
change: release-0-0-33-discord-8-acting-user-post-check-open-asks-scrubbed-at-rest-and-re-scrubbed-watch-comment-rate-limit
---

# Delta — cli (release 0.0.33)

## Added

### REQUIREMENT REQ-cli-424

The project SHALL ship package version `0.0.33` (DISCORD-8 acting-user post check, open asks scrubbed at rest and re-scrubbed, watch comment rate-limit backoff). CLI `version` and Discord presence (DISCORD-12) report `0.0.33` after a restart. CHANGELOG SHALL include verbose 0.0.33 notes.

Acceptance Criteria
- `package.json` version is `0.0.33`.
- CLI `version` prints `0.0.33`.
- CHANGELOG has a 0.0.33 section that the updater's changelog helper extracts exactly.

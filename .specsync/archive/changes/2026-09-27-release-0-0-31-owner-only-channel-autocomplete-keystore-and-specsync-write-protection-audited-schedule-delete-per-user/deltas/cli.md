---
module: cli
change: release-0-0-31-owner-only-channel-autocomplete-keystore-and-specsync-write-protection-audited-schedule-delete-per-user
---

# Delta — cli (release 0.0.31)

## Added

### REQUIREMENT REQ-cli-422

The project SHALL ship package version `0.0.31` (owner-only channel autocomplete, keystore and .specsync/ write protection, audited /schedule delete, per-user thread sessions, failing-step verify feedback, paused schedules ping the owner, presence on every IDENTIFY, SpecSync lists specs/). CLI `version` and Discord presence (DISCORD-12) report `0.0.31` after a restart. CHANGELOG SHALL include verbose 0.0.31 notes.

Acceptance Criteria
- `package.json` version is `0.0.31`.
- CLI `version` prints `0.0.31`.
- CHANGELOG has a 0.0.31 section that the updater's changelog helper extracts exactly.

---
module: cli
change: release-0-0-29-slash-asks-session-continuity-allowlisted-channel-gates-secret-path-hiding-schedule-run-recovery-schema
---

# Delta — cli (release 0.0.29)

## Added

### REQUIREMENT REQ-cli-420

The project SHALL ship package version `0.0.29` (slash asks + session continuity, allowlisted-channel gates, secret-path hiding, schedule-run recovery (schema v10), clean CLI errors, doctor reads the allowlist file). CLI `version` and Discord presence (DISCORD-12) report `0.0.29` after a restart. CHANGELOG SHALL include verbose 0.0.29 notes.

Acceptance Criteria
- `package.json` version is `0.0.29`.
- CLI `version` prints `0.0.29`.
- CHANGELOG has a 0.0.29 section that the updater's changelog helper extracts exactly.

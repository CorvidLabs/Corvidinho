---
module: cli
change: release-0-0-26-spend-cap-warn-ask-crash-restart-recovery-allowlist-fail-closed-safe-3-clamp-watch-dedup
---

# Delta — cli (release 0.0.26)

## Added

### REQUIREMENT REQ-cli-026

The project SHALL ship package version `0.0.26` (spend cap warn/ask, crash + restart recovery, allowlist fail-closed, SAFE-3 clamp, WATCH dedup). CLI `version` and Discord presence (DISCORD-12) report `0.0.26` after a restart. CHANGELOG SHALL include verbose 0.0.26 notes.

Acceptance Criteria
- `package.json` version is `0.0.26`.
- CLI `version` prints `0.0.26`.
- CHANGELOG has a 0.0.26 section that the updater's changelog helper extracts exactly.

---
module: cli
change: release-0-0-35-numeric-github-ids-dm-private-reads-github-forget-me-unskippable-verify-shell-guards-schedule-repo-gate
---

# Delta — cli (release 0.0.35)

## Added

### REQUIREMENT REQ-cli-426

The project SHALL ship package version `0.0.35` (numeric GitHub ids, DM private reads, GitHub forget-me, unskippable verify, shell guards, schedule repo gate). CLI `version` and Discord presence (DISCORD-12) report `0.0.35` after a restart. CHANGELOG SHALL include verbose 0.0.35 notes.

Acceptance Criteria
- `package.json` version is `0.0.35`.
- CLI `version` prints `0.0.35`.
- CHANGELOG has a 0.0.35 section that the updater's changelog helper extracts exactly.

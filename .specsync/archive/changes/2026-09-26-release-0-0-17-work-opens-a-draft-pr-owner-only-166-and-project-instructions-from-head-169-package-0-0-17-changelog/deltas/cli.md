---
module: cli
change: release-0-0-17-work-opens-a-draft-pr-owner-only-166-and-project-instructions-from-head-169-package-0-0-17-changelog
---

# Delta — cli (release 0.0.17)

## Added

### REQUIREMENT REQ-cli-018

The project SHALL ship package version `0.0.17` covering /work draft PRs (#166, owner-only) and project instructions read from HEAD (#169). CLI `version` and Discord presence (DISCORD-12) report `0.0.17` after a restart. CHANGELOG SHALL include verbose 0.0.17 notes with the allowlist step.

Acceptance Criteria
- `package.json` version is `0.0.17`.
- CLI `version` prints `0.0.17`.
- CHANGELOG has a 0.0.17 section that the updater's changelog helper extracts exactly.

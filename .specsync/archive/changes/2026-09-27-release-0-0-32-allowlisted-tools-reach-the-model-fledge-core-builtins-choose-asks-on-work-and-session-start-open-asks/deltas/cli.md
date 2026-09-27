---
module: cli
change: release-0-0-32-allowlisted-tools-reach-the-model-fledge-core-builtins-choose-asks-on-work-and-session-start-open-asks
---

# Delta — cli (release 0.0.32)

## Added

### REQUIREMENT REQ-cli-423

The project SHALL ship package version `0.0.32` (allowlisted tools reach the model, Fledge core builtins, Choose asks on work and session start, open asks kept per askId, role-refusal note, --project, doctor and init name project files). CLI `version` and Discord presence (DISCORD-12) report `0.0.32` after a restart. CHANGELOG SHALL include verbose 0.0.32 notes.

Acceptance Criteria
- `package.json` version is `0.0.32`.
- CLI `version` prints `0.0.32`.
- CHANGELOG has a 0.0.32 section that the updater's changelog helper extracts exactly.

---
module: cli
change: release-0-0-36-approval-cards-and-codes-must-ask-gate-owner-only-spend-no-default-model-tests-ran-verify-schedule-asks
---

# Delta — cli (release 0.0.36)

## Added

### REQUIREMENT REQ-cli-427

The project SHALL ship package version `0.0.36` (approval cards and codes, must-ask gate, owner-only spend, no default model, tests-ran verify, schedule asks). CLI `version` and Discord presence (DISCORD-12) report `0.0.36` after a restart. CHANGELOG SHALL include verbose 0.0.36 notes.

Acceptance Criteria
- `package.json` version is `0.0.36`.
- CLI `version` prints `0.0.36`.
- CHANGELOG has a 0.0.36 section that the updater's changelog helper extracts exactly.

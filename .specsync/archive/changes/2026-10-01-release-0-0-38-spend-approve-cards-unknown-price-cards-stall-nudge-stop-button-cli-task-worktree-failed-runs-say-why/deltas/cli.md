---
module: cli
change: release-0-0-38-spend-approve-cards-unknown-price-cards-stall-nudge-stop-button-cli-task-worktree-failed-runs-say-why
---

# Delta — cli (release 0.0.38)

## Added

### REQUIREMENT REQ-cli-429

The project SHALL ship package version `0.0.38` (spend approve cards, unknown-price cards, stall nudge, stop button, CLI task worktree, failed runs say why). CLI `version` and Discord presence (DISCORD-12) report `0.0.38` after a restart. CHANGELOG SHALL include verbose 0.0.38 notes.

Acceptance Criteria
- `package.json` version is `0.0.38`.
- CLI `version` prints `0.0.38`.
- CHANGELOG has a 0.0.38 section that the updater's changelog helper extracts exactly.

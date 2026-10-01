---
module: cli
change: release-0-0-39-pr-second-model-review-idle-and-turn-caps-cli-shell-in-worktree-public-thread-approve-cards-plain-worker
---

# Delta — cli (release 0.0.39)

## Added

### REQUIREMENT REQ-cli-431

The project SHALL ship package version `0.0.39` (PR second-model review, idle and turn caps, CLI shell in worktree, public-thread approve cards, plain worker and WATCH failure lines). CLI `version` and Discord presence (DISCORD-12) report `0.0.39` after a restart. CHANGELOG SHALL include verbose 0.0.39 notes.

Acceptance Criteria
- `package.json` version is `0.0.39`.
- CLI `version` prints `0.0.39`.
- CHANGELOG has a 0.0.39 section that the updater's changelog helper extracts exactly.

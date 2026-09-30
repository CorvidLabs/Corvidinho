---
module: cli
change: release-0-0-37-owner-worktree-shell-model-fallback-provider-spend-caps-specsync-changes-owner-schedules-stop-and-queue
---

# Delta — cli (release 0.0.37)

## Added

### REQUIREMENT REQ-cli-428

The project SHALL ship package version `0.0.37` (owner worktree shell, model fallback, provider spend caps, SpecSync changes, owner schedules, stop and queue). CLI `version` and Discord presence (DISCORD-12) report `0.0.37` after a restart. CHANGELOG SHALL include verbose 0.0.37 notes.

Acceptance Criteria
- `package.json` version is `0.0.37`.
- CLI `version` prints `0.0.37`.
- CHANGELOG has a 0.0.37 section that the updater's changelog helper extracts exactly.

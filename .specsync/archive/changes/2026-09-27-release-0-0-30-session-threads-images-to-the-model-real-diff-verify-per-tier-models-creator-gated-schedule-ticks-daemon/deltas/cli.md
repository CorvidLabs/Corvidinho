---
module: cli
change: release-0-0-30-session-threads-images-to-the-model-real-diff-verify-per-tier-models-creator-gated-schedule-ticks-daemon
---

# Delta — cli (release 0.0.30)

## Added

### REQUIREMENT REQ-cli-421

The project SHALL ship package version `0.0.30` (session threads, images to the model, real-diff verify, per-tier models, creator-gated schedule ticks + daemon asks reach Discord (schema v11), CI-strict spec-check, language runners, CI tags every version). CLI `version` and Discord presence (DISCORD-12) report `0.0.30` after a restart. CHANGELOG SHALL include verbose 0.0.30 notes.

Acceptance Criteria
- `package.json` version is `0.0.30`.
- CLI `version` prints `0.0.30`.
- CHANGELOG has a 0.0.30 section that the updater's changelog helper extracts exactly.

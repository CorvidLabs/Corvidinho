---
module: cli
change: release-0-0-47-session-5-5-a-per-model-window-condense-405-and-session-3-b-new-topic-393-package-bump-changelog-fold
---

# Delta — cli (release 0.0.47)

## Added

### REQUIREMENT REQ-cli-439

The project SHALL ship package version `0.0.47` (SESSION-5/5.a per-model window condense, SESSION-3.b new topic after v0.0.46). CLI `version` and Discord presence (DISCORD-12) report `0.0.47` after a restart. CHANGELOG SHALL include verbose 0.0.47 notes covering #405 / #393 (tip-orphans #429 / #430).

Acceptance Criteria
- `package.json` version is `0.0.47`.
- CLI `version` prints `0.0.47`.
- CHANGELOG has a 0.0.47 section that the updater's changelog helper extracts exactly.

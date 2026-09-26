---
module: cli
change: release-0-0-23-stop-means-stop-process-trees-safe-3-cd-clamp-scrub-before-clip-github-gate-reads-allowlist-file
---

# Delta — cli (release 0.0.23)

## Added

### REQUIREMENT REQ-cli-023

The project SHALL ship package version `0.0.23` (stop means stop (process trees), SAFE-3 cd clamp, scrub before clip, GitHub gate reads allowlist file). CLI `version` and Discord presence (DISCORD-12) report `0.0.23` after a restart. CHANGELOG SHALL include verbose 0.0.23 notes.

Acceptance Criteria
- `package.json` version is `0.0.23`.
- CLI `version` prints `0.0.23`.
- CHANGELOG has a 0.0.23 section that the updater's changelog helper extracts exactly.

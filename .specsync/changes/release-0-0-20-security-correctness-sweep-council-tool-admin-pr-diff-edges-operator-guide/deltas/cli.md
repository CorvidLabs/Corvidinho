---
module: cli
change: release-0-0-20-security-correctness-sweep-council-tool-admin-pr-diff-edges-operator-guide
---

# Delta — cli (release 0.0.20)

## Added

### REQUIREMENT REQ-cli-020

The project SHALL ship package version `0.0.20` (security + correctness sweep, council tool, admin/pr-diff edges, operator guide). CLI `version` and Discord presence (DISCORD-12) report `0.0.20` after a restart. CHANGELOG SHALL include verbose 0.0.20 notes.

Acceptance Criteria
- `package.json` version is `0.0.20`.
- CLI `version` prints `0.0.20`.
- CHANGELOG has a 0.0.20 section that the updater's changelog helper extracts exactly.

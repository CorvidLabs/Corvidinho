---
module: cli
change: release-0-0-43-github-7-typed-github-pr-merge-for-own-green-corvidinho-prs-395-397-package-bump-changelog-fold
---

# Delta — cli (release 0.0.43)

## Added

### REQUIREMENT REQ-cli-435

The project SHALL ship package version `0.0.43` (GITHUB-7 self-merge after v0.0.42). CLI `version` and Discord presence (DISCORD-12) report `0.0.43` after a restart. CHANGELOG SHALL include verbose 0.0.43 notes covering #395 typed `github-pr-merge` (closes #99; tip-orphan #397).

Acceptance Criteria
- `package.json` version is `0.0.43`.
- CLI `version` prints `0.0.43`.
- CHANGELOG has a 0.0.43 section that the updater's changelog helper extracts exactly.

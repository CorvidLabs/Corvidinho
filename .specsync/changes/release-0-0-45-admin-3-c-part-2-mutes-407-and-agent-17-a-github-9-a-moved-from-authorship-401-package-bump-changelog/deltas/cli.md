---
module: cli
change: release-0-0-45-admin-3-c-part-2-mutes-407-and-agent-17-a-github-9-a-moved-from-authorship-401-package-bump-changelog
---

# Delta — cli (release 0.0.45)

## Added

### REQUIREMENT REQ-cli-437

The project SHALL ship package version `0.0.45` (ADMIN-3.c part 2 mutes, AGENT-17.a / GITHUB-9.a moved-from authorship after v0.0.44). CLI `version` and Discord presence (DISCORD-12) report `0.0.45` after a restart. CHANGELOG SHALL include verbose 0.0.45 notes covering #407 / #401 (tip-orphans #421 / #422).

Acceptance Criteria
- `package.json` version is `0.0.45`.
- CLI `version` prints `0.0.45`.
- CHANGELOG has a 0.0.45 section that the updater's changelog helper extracts exactly.

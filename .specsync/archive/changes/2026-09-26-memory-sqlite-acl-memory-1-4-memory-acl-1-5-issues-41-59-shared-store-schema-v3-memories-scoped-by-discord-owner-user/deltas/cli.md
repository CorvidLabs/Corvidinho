---
module: cli
change: memory-sqlite-acl-memory-1-4-memory-acl-1-5-issues-41-59-shared-store-schema-v3-memories-scoped-by-discord-owner-user
---

# Delta — cli (package 0.0.4 with MEMORY ship)

## Added

### REQUIREMENT REQ-cli-011

The project SHALL ship package version `0.0.4` with the MEMORY SQLite + ACL
feature (issues #41 / #59). The shared `src/version.ts` helper SHALL continue
to read semver from `package.json` so CLI `version` and Discord presence
(DISCORD-12) report `0.0.4` after update. CHANGELOG SHALL include verbose
0.0.4 notes for MEMORY + ACL. STATUS.md SHALL mark MEMORY #41/#59 done.

Acceptance Criteria
- `package.json` version is `0.0.4`.
- CLI `version` prints `0.0.4`.
- CHANGELOG has a 0.0.4 section covering MEMORY SQLite + ACL.
- STATUS roadmap lists MEMORY #41/#59 as Done with the ship PR.
- Discord presence continues to use `formatPresenceVersionString()` (no hardcoded bridge version).

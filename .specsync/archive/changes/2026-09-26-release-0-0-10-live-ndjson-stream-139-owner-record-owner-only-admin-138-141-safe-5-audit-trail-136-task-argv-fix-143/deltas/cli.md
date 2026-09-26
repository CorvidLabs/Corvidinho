---
module: cli
change: release-0-0-10-live-ndjson-stream-139-owner-record-owner-only-admin-138-141-safe-5-audit-trail-136-task-argv-fix-143
---

# Delta — cli (release 0.0.10)

## Added

### REQUIREMENT REQ-cli-016

The project SHALL ship package version `0.0.10` covering the live NDJSON
event stream (#139, protocol 2), the durable owner record and owner-only ADMIN
(#138, #141), the SAFE-5 audit trail (#136) and the `--task` argv fix (#143).
CLI `version` and Discord presence (DISCORD-12) report `0.0.10` after a
restart. CHANGELOG SHALL include verbose 0.0.10 notes with the upgrade steps
(set the owner; restart bridge and binary together). STATUS.md SHALL record
the slices.

Acceptance Criteria
- `package.json` version is `0.0.10`.
- CLI `version` prints `0.0.10`.
- CHANGELOG has a 0.0.10 section with upgrade notes; the updater's changelog helper extracts it exactly.
- STATUS records #136, #138/#141, #139 and #143.

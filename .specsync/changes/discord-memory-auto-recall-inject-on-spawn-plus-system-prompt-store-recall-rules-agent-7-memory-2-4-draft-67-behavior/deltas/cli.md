---
module: cli
change: discord-memory-auto-recall-inject-on-spawn-plus-system-prompt-store-recall-rules-agent-7-memory-2-4-draft-67-behavior
---

# Delta — cli (package 0.0.7)

## Modified

### SPEC SECTION Change Log

Preserve historical Change Log prose/rows; append the memory-discord-inject row.

| 2026-09-26 | memory-discord-inject: package 0.0.7 with MEMORY Discord inject (REQ-cli-014) |

## Added

### REQUIREMENT REQ-cli-014

The project SHALL ship package version `0.0.7` with MEMORY Discord inject
(AGENT-7 / MEMORY-2/4). CLI `version` and Discord presence (DISCORD-12) report
`0.0.7` after bridge restart. CHANGELOG SHALL include verbose 0.0.7 notes.
STATUS.md SHALL record the slice.

Acceptance Criteria
- `package.json` version is `0.0.7`.
- CLI `version` prints `0.0.7`.
- CHANGELOG has a 0.0.7 section covering MEMORY Discord inject.
- STATUS ROADMAP marks MEMORY Discord inject done.

---
module: cli
change: cover-leftover-cli-package-0-0-5-req-cli-012-paths-for-specsync-audit-after-session-worktree-archive-no-module-ac
---

# Delta — cli (cover 0.0.5)

## Modified

### REQUIREMENT REQ-cli-012

The project SHALL ship package version `0.0.5` with SESSION-WORKTREE isolation
(REQ-discord-022 / #58). CLI `version` and Discord presence/custom status
(DISCORD-12) report `0.0.5` after bridge update. CHANGELOG SHALL include verbose
0.0.5 notes for SESSION-WORKTREE. STATUS.md SHALL mark #58 done.

Acceptance Criteria
- `package.json` version is `0.0.5`.
- CLI `version` prints `0.0.5`.
- CHANGELOG has a 0.0.5 section covering SESSION-WORKTREE.
- STATUS marks #58 Done.

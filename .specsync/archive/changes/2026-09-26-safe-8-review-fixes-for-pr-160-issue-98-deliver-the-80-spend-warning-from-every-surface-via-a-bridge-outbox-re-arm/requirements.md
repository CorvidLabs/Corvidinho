---
change: safe-8-review-fixes-for-pr-160-issue-98-deliver-the-80-spend-warning-from-every-surface-via-a-bridge-outbox-re-arm
artifact: requirements
---

# Requirements

Implements REQ-agent-098, REQ-discord-098 and REQ-cli-098 as modified by the
amended SAFE-8 change (no requirement text here).

| Captured id | Status after this change |
|---|---|
| SAFE-8 (amended) | Partially met: 80% warning reaches the owner once per crossing from any surface; at 100% the run asks the owner (pinged once per episode) on every bridge surface. The Approve card (#96) is not built. |
| AUTONOMY-1/2 | `/work` and `/session start` now post a run's ask with the owner ping. |

Left for HI capture: Approve card (#96, draft SAFE-18..20); draft SAFE-14..16.

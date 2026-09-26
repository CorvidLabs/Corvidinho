---
change: safe-8-amended-issue-98-warn-at-80-of-the-daily-spend-cap-and-ask-at-100-instead-of-refusing-once-per-crossing-a-run
artifact: requirements
---

# Requirements

Captured HI and how this change meets it:

| Id | Status | How |
|---|---|---|
| SAFE-8 (amended) | Partially met | Warning at 80% once per crossing (Text event, `result.spendWarning`, and the owner is pinged on the bridge's next post whatever surface crossed it). At 100% the call is not sent; the run ends `blocked` and asks the owner through the AUTONOMY-1/2 path on every bridge surface, stating spend vs cap and the operator action, pinging once per cap episode. Never spends past the cap. **Not met:** "an Approve card to continue" — until #96 exists, continuing means the operator raises or unsets the cap and restarts. |
| AUTONOMOUS-8 | Met | `doctor` and Discord `/status` show rolling 24 h spend vs the cap with the percent. |
| AUTONOMY-1/2 (reused) | Met for spend-cap | The spend-cap ask uses the existing ask path and owner ping; `/work` and `/session start` now post any ask the same way. |

Modified requirements (deltas): REQ-agent-098, REQ-cli-098,
REQ-discord-098.

Left for HI capture (not built): the Approve card button itself (#96, draft
SAFE-18..20); per-provider caps and unknown spend shown as unknown (draft
SAFE-14..16); caps set from Discord admin; AlgoChat fees.

---
change: safe-8-amended-issue-98-warn-at-80-of-the-daily-spend-cap-and-ask-at-100-instead-of-refusing-once-per-crossing-a-run
artifact: requirements
---

# Requirements

Captured HI met by this change:

| Id | How |
|---|---|
| SAFE-8 (amended) | Warning at 80% (once per crossing: Text event, `result.spendWarning`, Discord reply / schedule post line with owner ping). At 100% the call is not sent; the run ends `blocked` and asks the owner through the AUTONOMY-1/2 path, stating spend vs cap and how to continue. Never spends past the cap. |
| AUTONOMOUS-8 | `doctor` and Discord `/status` show rolling 24 h spend vs the cap with the percent. |
| AUTONOMY-1/2 (reused) | The spend-cap ask uses the existing ask path and owner ping. |

Modified requirements (deltas): REQ-agent-098, REQ-cli-098,
REQ-discord-098.

Left for HI capture (not built): the Approve card button itself (#96, draft
SAFE-18..20) — until it exists, "approve" means raising or unsetting the cap
and asking again; per-provider caps and unknown spend shown as unknown (draft
SAFE-14..16); caps set from Discord admin; AlgoChat fees.

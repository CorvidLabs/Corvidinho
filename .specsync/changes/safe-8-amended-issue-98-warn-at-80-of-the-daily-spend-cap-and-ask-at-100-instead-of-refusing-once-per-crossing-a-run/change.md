---
id: safe-8-amended-issue-98-warn-at-80-of-the-daily-spend-cap-and-ask-at-100-instead-of-refusing-once-per-crossing-a-run
state: verifying
type: feature
base_commit: c238e3029a833915f1b31f75d23ed09f6e5c584f
---

# SAFE-8 amended (issue #98): warn at 80% of the daily spend cap and ask at 100% instead of refusing. Once per crossing a run that pushes rolling 24h spend to 80% of CORVIDINHO_DAILY_SPEND_CAP_USD emits a warning (Text event, result spendWarning, Discord reply line with owner ping); a provider call that would pass the cap is stopped before it is sent and the run ends blocked with a spend-cap ask to the owner via the AUTONOMY-1/2 ask path stating spend vs cap and how to continue; doctor and Discord /status show 24h spend vs the cap (AUTONOMOUS-8); Approve card (#96) left for HI capture

## Intent

SAFE-8 amended (issue #98): warn at 80% of the daily spend cap and ask at 100% instead of refusing. Once per crossing a run that pushes rolling 24h spend to 80% of CORVIDINHO_DAILY_SPEND_CAP_USD emits a warning (Text event, result spendWarning, Discord reply line with owner ping); a provider call that would pass the cap is stopped before it is sent and the run ends blocked with a spend-cap ask to the owner via the AUTONOMY-1/2 ask path stating spend vs cap and how to continue; doctor and Discord /status show 24h spend vs the cap (AUTONOMOUS-8); Approve card (#96) left for HI capture

## Affected Canonical Specs

- `agent`
- `cli`
- `discord`

## Acceptance Criteria

- With CORVIDINHO_DAILY_SPEND_CAP_USD set: (1) when a run's settled provider call brings rolling 24h spend to at least 80% of the cap, one warning is recorded in a module-owned spend_alerts table inside an IMMEDIATE transaction (at most once per cap value per 24h across processes), the run emits a Text event naming spend vs cap, TaskResult.spendWarning carries the numbers on --json and the NDJSON result frame, and the Discord chat reply and schedule post append a warning line that pings the configured owner; (2) a provider call whose estimate would push spend past the cap (or any call while the cap value is invalid, the model is unpriced, or the ledger is unavailable) is never sent: the attempt ends with an ask reason spend-cap whose question states spend, estimate and cap and says how to continue (raise or unset the cap and ask again, or wait for spend to leave the window), runTask returns state blocked (verify skipped, exit 0), and the Discord bridge and scheduler post it through the AUTONOMY-1/2 ask path with the owner pinged (schedules ping once until a clean run); (3) doctor always prints a spend line (info when no cap, ok/warn with 24h spend, cap and percent, warn at 80% and at the cap) and Discord /status shows the same 24h spend vs cap line; no cap means the fetch is untouched and no DB is opened; fixture tests with mocked fetch only

## No-spec Rationale

Not applicable

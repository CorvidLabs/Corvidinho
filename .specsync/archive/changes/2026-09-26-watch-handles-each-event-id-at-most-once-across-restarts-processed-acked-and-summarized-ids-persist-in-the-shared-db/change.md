---
id: watch-handles-each-event-id-at-most-once-across-restarts-processed-acked-and-summarized-ids-persist-in-the-shared-db
state: archived
type: bug_fix
base_commit: 7af2cec07739d7af3cf3ab6e77855707cdaa1e68
---

# WATCH handles each event id at most once across restarts: processed, acked and summarized ids persist in the shared DB and denied ids no longer evict handled ids

## Intent

WATCH handles each event id at most once across restarts: processed, acked and summarized ids persist in the shared DB and denied ids no longer evict handled ids

## Affected Canonical Specs

- `watch`

## Acceptance Criteria

- A restarted watcher on the same data dir does not re-run, re-ack or re-summarize an event id it already handled; 2000 denied stranger mentions do not evict a handled trusted id, so the trusted request never runs twice; processed/acked/summarized ids persist per kind in the shared DB; without a DB the stores stay in-memory with the old FIFO cap.

## No-spec Rationale

Not applicable

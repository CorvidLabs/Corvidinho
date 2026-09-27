---
module: watch
change: watch-never-drops-or-skips-a-trusted-request-when-an-event-id-write-fails
---

# Delta — watch (a failed event-id write never drops or skips a trusted request)

## Modified

### REQUIREMENT REQ-watch-247

When `startWatchPoller` has a database (the shared Corvidinho DB it opens, or an
injected `db`), the processed, acked and summarized event-id sets SHALL persist
in that DB (table `watch_event_ids`, one namespace per kind), so a watcher
restarted on the same data dir SHALL NOT route, ack, spawn or summarize an
event id it already handled (REQ-watch-005 / REQ-watch-007 / REQ-watch-009 "at
most once per event id", WATCH-RELIABILITY-1). The durable sets SHALL NOT evict
by count. Ids of events refused by the allowlist gate (ALLOW-1 / ALLOW-5) SHALL
be kept in a separate in-memory set that never shares or evicts the handled
ids, so a flood of non-allowlisted mentions cannot make a handled trusted
request run again. Ids are marked before any ack or spawn; if that write fails,
the event SHALL be logged and left for the next cycle without aborting the
cycle (REQ-watch-037), and SHALL NOT be marked by a retry later in the same
cycle, since nothing ran for it. Only a failure before the id write (routing)
is marked processed, as REQ-watch-037 already requires. The acked and
summarized id writes that follow a posted comment SHALL be best-effort: a
failure is logged and SHALL NOT skip the agent run or the summary for an event
that was already acknowledged. Without a database the stores stay in-memory
with the existing FIFO cap. Rows hold event ids only, never free text.

Acceptance Criteria
- A second poller started on the same data dir with the same fetched comment reports `new=0`, spawns no agent, and posts no second ack or summary.
- After a handled trusted comment, a cycle with 2000 non-allowlisted mentions refuses all 2000, and the next cycle neither starts nor continues the trusted request.
- Processed, acked and summarized ids written through one DB handle are found (case-insensitively) through a new handle on the same file, and kinds do not leak into each other; a durable store is not FIFO-capped.
- If marking an id fails, the cycle completes, nothing runs for that event, and the next cycle handles it once, even when an immediate retry of the write would have succeeded.
- If the acked or summarized id write fails after the comment is posted, the failure is logged, the agent still runs once and the summary is still posted once.
- Fixture tests need no live GitHub token or network.

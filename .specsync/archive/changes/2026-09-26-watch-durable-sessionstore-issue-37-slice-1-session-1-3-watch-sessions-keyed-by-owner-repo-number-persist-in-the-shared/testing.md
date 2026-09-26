---
change: watch-durable-sessionstore-issue-37-slice-1-session-1-3-watch-sessions-keyed-by-owner-repo-number-persist-in-the-shared
artifact: testing
---

# Testing

- `tests/watch.session-store.durable.test.ts`: schema v6 + table; reopen keeps
  the session and issue map; touch within TTL keeps it (router continues);
  idle past TTL purges and router starts a fresh session; expired rows dropped
  on load; one session per issue key; topic scrubbed in DB; `watch_sessions.topic`
  is a SCRUB_TARGETS entry and re-scrubs; a v5 DB migrates to 6; poller on the
  same data dir continues the same issue session across a restart; injected db
  is not closed; dry-run poller without a data dir stays in-memory.
- Same file, review hardening: `stop()` mid-cycle starts no further agent spawn
  and waits for the in-flight run before closing the DB; `stop()` while the ack
  is in flight skips that event's spawn; concurrent `pollOnce` joins the
  in-flight cycle and interval ticks are skipped while a long cycle runs (fake
  timers); a throwing event is logged, marked processed, and later events still
  run; `touch` after a second watcher replaced the issue row does not throw and
  does not wedge the poll cycle.
- Existing `tests/watch.*.test.ts` stay green (in-memory store path).

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-watch-037 | `tests/watch.session-store.durable.test.ts` |
| REQ-discord-037 | `tests/watch.session-store.durable.test.ts` |

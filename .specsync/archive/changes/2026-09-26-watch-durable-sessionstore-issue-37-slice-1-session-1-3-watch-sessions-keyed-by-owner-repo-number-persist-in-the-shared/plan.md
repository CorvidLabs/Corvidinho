---
change: watch-durable-sessionstore-issue-37-slice-1-session-1-3-watch-sessions-keyed-by-owner-repo-number-persist-in-the-shared
artifact: plan
---

# Plan

1. Schema v6 `watch_sessions` in `src/store/db.ts`; SCRUB_TARGETS entry.
2. Durable + TTL `SessionStore` in `src/watch/session-store.ts`.
3. Wire `startWatchPoller` to open/inject/close the shared DB.
4. Fixture tests (`tests/watch.session-store.durable.test.ts`, scrub target).
5. Spec deltas REQ-watch-037 / REQ-discord-037, docs/WATCH.md, SpecSync, verify, PR.

---
change: watch-reliability-poll-cycle-logging-error-catch-auto-ack-github-comment-on-start-continue-ignore-own-mentions-document
artifact: requirements
---

# Requirements

1. Poll cycle logging of fetched/new/started/continued/refused/skipped every cycle.
2. pollOnce errors caught and logged (not swallowed by void).
3. Auto-ack GitHub comment on start/continue for issue_comment/issues when sender ≠ watch username; once per event id; Made with Corvidinho footer.
4. Ignore own watch-username mentions/comments in fetchWatchEvents.
5. Document org search pagination bury risk; raise per_page toward 100.
6. Fixture tests offline; SpecSync + fledge verify green. No new HI numbers.

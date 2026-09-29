---
change: watch-assignment-and-review-request-events-also-pass-the-user-allowlist-on-the-user-who-assigned-or-requested-the-actor
artifact: plan
---

# Plan

1. `DetectedEvent.actor`; `SearchClient.findRequestActor` (fixture +
   Octokit over the shared newest-pages pager); `fetchWatchEvents` sets it.
2. `gateEvent` in the router (repo, author, actor for assignment /
   review_request); `routeEvent` and the poller's `preferAllowlisted` use it.
3. Fixture `mentions.json` gets allowlisted actors for #7 / #48 so existing
   fixture cycles keep starting them.
4. Tests: router actor gate, poller cycles (untrusted / missing / denied /
   allowlisted actor, no shadowing of a trusted comment), Octokit events read
   over a stubbed transport. Prove they fail on main's source, then restore.
5. `docs/WATCH.md`; spec delta (REQ-watch-302 Added; REQ-watch-003,
   also modified by the open security-gate change, is left alone), `specs/watch/testing.md`, the new test file in `watch.spec.md`.
6. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.

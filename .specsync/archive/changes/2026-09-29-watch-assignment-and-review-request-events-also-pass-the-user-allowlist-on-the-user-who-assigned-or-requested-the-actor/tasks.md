---
change: watch-assignment-and-review-request-events-also-pass-the-user-allowlist-on-the-user-who-assigned-or-requested-the-actor
artifact: tasks
---

# Tasks

- [x] `DetectedEvent.actor` (`src/watch/types.ts`).
- [x] `SearchClient.findRequestActor`: fixture maps + Octokit `issues.listEvents` over the shared newest-pages pager; pure `newestRequestActor`; `fetchWatchEvents` sets `actor` (`src/watch/searcher.ts`).
- [x] `gateEvent` (repo, author, actor for assignment / review_request) used by `routeEvent` and the poller's `preferAllowlisted` (`src/watch/router.ts`, `src/watch/poller.ts`); exports in `src/watch/index.ts`.
- [x] Fixture `tests/fixtures/watch/mentions.json` gets allowlisted actors for #7 / #48.
- [x] Tests: `tests/watch.router.test.ts`, `tests/watch.poller.test.ts`, new `tests/watch.request-actor.test.ts`.
- [x] Fail-on-main proof (main's `src/watch` swapped in, then restored) and the poller-gate mutation.
- [x] `docs/WATCH.md`; spec delta (REQ-watch-302 Added); `specs/watch/testing.md`; new test file in `watch.spec.md` `files:`.
- [x] SpecSync approve / check / audit, coverage, `hi check`, tsc, `bun test`, fledge verify.

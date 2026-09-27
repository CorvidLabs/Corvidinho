---
change: safe-8-review-follow-up-for-pr-160-issue-98-a-post-that-did-not-go-out-hands-back-the-80-spend-warning-and-the-spend
artifact: plan
---

# Plan

1. Regression tests first (outbox scenario 80% → 72% → 96%, releasable cap
   ping, slash expired token, slash nothing delivered, chat and schedule
   failed posts, spend-cap not pending, legacy row load) — confirm they fail
   on the previous code.
2. `spend-alerts.ts` / `spend-outbox.ts`: claim only at ≥ 80%, releasable
   cap-ping claim.
3. `spend-post.ts`, `work.ts`, `session.ts`: notice release and a reply
   failure that still posts the notice.
4. `bridge.ts`, `scheduler/service.ts`, `session-store.ts`: release on an
   unposted reply/post; no ping key for an unposted ping; spend-cap never
   pending.
5. Modified deltas for REQ-agent-098 / REQ-discord-098, spec prose, verify.

---
change: safe-8-review-follow-up-for-pr-160-issue-98-a-post-that-did-not-go-out-hands-back-the-80-spend-warning-and-the-spend
artifact: tasks
---

# Tasks

- [x] Regression tests added and shown failing on the previous code (10 fail before, all pass after).
- [x] Outbox: warnings stay pending under 80%; releasable `claimCapPing`.
- [x] Slash: `OwnerNotice.release`; `replyWithOwnerNotice` survives a failed reply.
- [x] Chat and scheduler: release warning and cap ping on an unposted post; schedule keeps no ping key then.
- [x] Spend-cap stops are never the session pending ask (bridge + load filter).
- [x] Deltas (Modified REQ-agent-098, REQ-discord-098) and spec prose.
- [x] `bunx tsc --noEmit`, `bun test`, `specsync check --require-coverage 100`, `specsync change audit`, `fledge lanes run verify --non-interactive`.

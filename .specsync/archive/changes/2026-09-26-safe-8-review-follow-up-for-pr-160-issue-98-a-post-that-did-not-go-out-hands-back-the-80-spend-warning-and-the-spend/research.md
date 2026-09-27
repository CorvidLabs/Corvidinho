---
change: safe-8-review-follow-up-for-pr-160-issue-98-a-post-that-did-not-go-out-hands-back-the-80-spend-warning-and-the-spend
artifact: research
---

# Research

- The live gateway's `reply` catches send errors and returns null, but a
  slash `editReply` after the 15-minute interaction token lifetime throws
  ("Unknown interaction" / invalid webhook token); `ctx.post` is a plain
  channel send that needs no interaction token, so it still works then.
- Release vs `rearm` for a warning found moot: with a `rearm` row, 80% →
  72% → 80% (never under the 70% re-arm level) would record a second
  `warn` row in what is one crossing, and the row re-arms the cap ping as
  well. Keeping the claim atomic (spend read inside the claim transaction)
  avoids a claim-then-release window in which a concurrent poster sees the
  warning as delivered.
- `AUTONOMY-5/6` restate/cancel logic keys only on `session.pendingAsk`;
  keeping spend-cap asks out of it is enough for thin and substantive
  replies, and the load-time filter covers rows written by earlier builds of
  this branch.

---
change: safe-8-review-follow-up-for-pr-160-issue-98-a-post-that-did-not-go-out-hands-back-the-80-spend-warning-and-the-spend
artifact: design
---

# Design

- Pending under 80% (`src/agent/spend-alerts.ts` `claimSpendWarnings`): the
  outbox passes a current-spend reader; inside the same IMMEDIATE
  transaction the claim reads spend and, while it is under 80% of the latest
  warning's cap, claims nothing. Leaving the row pending was chosen over
  writing a `rearm` row: the pending row keeps the crossing disarmed, so a
  crossing can never record or deliver a second warning, and a `rearm` row
  would also have re-armed the cap ping at 72%. The row still ages out after
  24 h, when `warnArmed` re-arms as before.
- Releasable cap ping: `claimSpendCapPing` returns the inserted `cap` row's
  id; `releaseSpendCapPing` deletes that row (kind-guarded). The outbox's
  `claimCapPing()` returns `{ release }` or null; DB errors still fail open
  (a no-op claim). `askPingOwner` carries `release`.
- Chat (`src/discord/bridge.ts`): the reply is sent in try/finally; when it
  returned null (or threw) the warning and the cap ping are released; the
  dry-run branch (nothing posted) releases the cap ping too.
- Scheduler (`src/scheduler/service.ts`): on a post that resolved `false`
  (or threw) the warning and the cap ping are released and no ping key is
  stored.
- Slash (`src/discord/spend-post.ts`): `OwnerNotice.release` releases the
  warning and the ask's cap ping; `slashOwnerNotice` releases the cap ping
  itself when it returns null. `replyWithOwnerNotice` catches a failed reply,
  still posts the notice through `ctx.post`, falls back to appending only
  when the reply had gone out, releases when nothing carried the notice, and
  re-raises the reply error afterwards (the gateway logs it as before).
  `/work` and `/session start` pass their `askOwner` through.
- Pending asks: the bridge stores `null` instead of a `spend-cap` ask
  (clearing any older pending ask), the thin-ack restate is back to main's
  `owner: config.owner`, and `parsePendingAsk` in
  `src/discord/session-store.ts` loads a stored `spend-cap` ask as none.

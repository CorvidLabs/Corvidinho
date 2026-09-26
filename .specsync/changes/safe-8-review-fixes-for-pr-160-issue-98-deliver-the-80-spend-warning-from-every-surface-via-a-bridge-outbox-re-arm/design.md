---
change: safe-8-review-fixes-for-pr-160-issue-98-deliver-the-80-spend-warning-from-every-surface-via-a-bridge-outbox-re-arm
artifact: design
---

# Design

Full design notes: the amended change's `design.md` ("Delivery is separate
from recording", "Spend-cap ask on every surface"). Paths in this change:

- `src/agent/spend-alerts.ts` — owns `spend_alerts` (constant kinds and
  integers only; `delivered_at` added to an older table). `warn` rows are
  recorded pending; `rearm` rows (per cap value) are written when a settle
  or a reservation sees spend under 70% while a `warn` or `cap` row is in
  force; `cap` rows record an owner ping for a spend-cap stop. Armed = no
  row of that kind for the cap value newer than its last `rearm` and < 24 h
  old. Claims run in one IMMEDIATE transaction.
- `src/agent/spend-outbox.ts` — `createSpendAlertOutbox({ db, env })`:
  `takeWarning(fallback)` claims pending warnings (current spend; dropped
  when back under 80%; `release()` on a failed post; no DB ⇒ the run's own
  warning) and `claimCapPing()` (once per episode; fails open to pinging).
- `src/discord/spend-post.ts` — `askPingOwner`, `takeSpendWarning`,
  `ownerAskNoticeLine`, `slashOwnerNotice`, `replyWithOwnerNotice`: shared by
  the chat reply, `/work`, `/session start` and schedule posts. Slash owner
  notices are a fresh channel post (a deferred-reply edit may not notify a
  mention), else appended to the reply.
- `src/discord/command-handlers/work.ts` / `session.ts` — handle
  `result.ask` through `formatAskReply` (paused status, ask in the reply,
  spend-cap PR line for `/work`) and send the owner notice.
- `src/discord/work-store.ts` — `WorkTaskStatus` gains `blocked`.
- `src/daemon/daemon.ts` — logs `spend.warning` and `run.needs_human` (warn)
  from `ScheduleRunFinished`.

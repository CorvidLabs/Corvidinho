---
change: safe-8-amended-issue-98-warn-at-80-of-the-daily-spend-cap-and-ask-at-100-instead-of-refusing-once-per-crossing-a-run
artifact: research
---

# Research

- Ask path on main (#163): `src/agent/ask.ts` (`HumanAsk`, `blockedTaskResult`,
  `askFromUnknown`), `src/agent/loop.ts` (an `ExecuteResult.ask` ends the run
  `blocked`, verify skipped, no retry), `src/discord/ask-ping.ts`
  (`formatAskReply`, `askPingKey`), bridge and scheduler posting with
  `mentionUserIds` so the live gateway limits allowed mentions.
- The provider fetch errors are swallowed by `chatCompletions` into an error
  summary, so a thrown refusal cannot reach `runTask` directly; a side
  channel (`finish`) on the guard is the smallest hook that keeps the
  attempt's `filesChanged` and needs no change to the tool loop.
- `withSpendCap` (PR #160) is kept as a thin wrapper over `createSpendGuard`
  so existing call sites and tests keep working.
- Dedupe: the 80% warning must hold across bridge-spawned processes sharing
  one DB, so it is recorded in SQLite in the same IMMEDIATE transaction as
  its check, like the ledger reservation.
- Owner-ping dedupe for schedules keys on reason + question; spend-cap
  questions carry live amounts, so the key ignores them for that reason.
- WATCH posts run summaries to GitHub (`src/watch/summary.ts`) and ignores
  `result.ask` / `result.spendWarning`. Rather than touch the watch module,
  the runner's summary at the cap is the generic `SPEND_CAP_SUMMARY` (no
  amounts, env names or restart hints), so the public comment leaks nothing;
  WATCH's spawn log carries the same line, and its 80% warning reaches the
  owner through the bridge outbox.
- Review (PR #160): the only surfaces that know the owner are the Discord
  bridge's posts; the daemon and WATCH have none. Recording in the runner and
  delivering from the bridge (claimed in SQLite) is the one design that
  covers every surface without per-consumer plumbing. A slash reply is an
  edit of a deferred interaction response, which may not notify a mention,
  so the owner notice is a fresh channel post.

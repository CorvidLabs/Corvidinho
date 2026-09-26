---
change: safe-8-amended-issue-98-warn-at-80-of-the-daily-spend-cap-and-ask-at-100-instead-of-refusing-once-per-crossing-a-run
artifact: design
---

# Design

## Ask at 100% (no spend past the cap)

- `createSpendGuard(fetch, opts)` in `src/agent/spend.ts` returns
  `{ fetch, finish }`. With no cap, `fetch` is the original fetch and
  `finish` is the identity (no DB, no behavior change).
- With a cap, the guarded fetch still reserves the estimate in one IMMEDIATE
  transaction. When the reservation is refused (spend + estimate > cap), or
  the cap value is invalid, the model is unpriced, or the ledger cannot be
  opened, it records a `HumanAsk { reason: "spend-cap", question }` and
  throws `SpendCapRefusal` (which carries the ask) before any request.
- The tool loop's existing `chatCompletions` catch turns the throw into an
  error result, so the attempt returns immediately and no further call is
  made. `createTaskExecute` passes every attempt's result through
  `spend.finish`, which swaps it for `{ summary: SPEND_CAP_SUMMARY,
  filesChanged, ask }` when an ask is pending. `runTask` already maps
  `ExecuteResult.ask` to state `blocked` with verify skipped and no retry
  (AUTONOMY-1), so the run ends `blocked` and `task run` exits 0.
- Hot-file footprint: `execute.ts` swaps `withSpendCap` for
  `createSpendGuard`, adds `onSpendWarning`, and wraps the returned closure
  (`return async (ctx) => spend.finish(await run(ctx))`).

## Warn at 80% (once per crossing)

- After each settle, `SpendLedger.noteWarning({ capMicroUsd, now })` runs one
  IMMEDIATE transaction: read 24 h spend; if ≥ 80% and the warning for this
  cap value is armed, insert a pending `warn` row (`delivered_at` NULL) and
  return `SpendWarning { spentMicroUsd, capMicroUsd, percent }`. Concurrent
  processes therefore warn once between them; a zero cap never warns.
- Arming lives in `src/agent/spend-alerts.ts`. Rows carry their cap value.
  The warning is armed unless a `warn` row for that cap value is newer than
  the last `rearm` row for it and < 24 h old. A settle or the next call's
  reservation that sees spend under 70% records a `rearm` row (only when
  something is disarmed), so a second crossing inside 24 h warns again
  (review finding: the first cut warned at most once per cap per 24 h). The
  70–80% band stops spend that hovers at 80% (old calls leaving the window,
  new ones arriving) from warning on every call; per-cap rows stop a process
  with a much larger cap from re-arming a smaller one.

## Delivery is separate from recording (review finding, major)

The first cut showed the warning only on Discord chat replies and bridge
schedule posts, while the dedupe was global: a crossing made by WATCH,
`/work`, `/session start`, a delegate worker, the daemon or a schedule whose
channel left the allowlist recorded the row and silently used the warning up
for 24 h.

- `spend_alerts.delivered_at` (added with ALTER TABLE to an older table).
  Runs only record. `src/agent/spend-outbox.ts` `createSpendAlertOutbox({
  db, env })` is the delivery side: `takeWarning(fallback)` claims every
  pending warning of the last 24 h in one IMMEDIATE transaction and returns
  it with current spend (dropped when spend is back under 80%);
  `release()` hands it back when the post failed. No DB (or no table) ⇒ the
  run's own `spendWarning`.
- The bridge builds one outbox and every post takes from it: chat reply,
  `/work`, `/session start`, schedule posts. So a warning recorded anywhere
  on the data dir reaches the owner on the bridge's next post, once.
- The daemon logs `spend.warning` / `run.needs_human` (warn); the row stays
  pending for a bridge. The CLI keeps printing the `Text` warning to stderr.

## Spend-cap ask on every surface (review findings, minor)

- `claimCapPing()` (a delivered `cap` row, same arming as the warning) makes
  the owner ping once per cap episode across chat, slash commands and
  schedules (`src/discord/spend-post.ts` `askPingOwner`). Schedules keep
  their per-schedule ping key too.
- `/work` and `/session start` now handle `result.ask` like chat: the ask in
  the reply through `formatAskReply`, paused status (not ✅), `/work` status
  `blocked` (new `WorkTaskStatus`; stuck stays `failed`), a spend-cap PR
  line. The owner ping and pending warning go out as a fresh channel post
  (`SlashContext.post` = gateway reply), because an edit of a deferred reply
  may not notify a mention; without a post function (or on failure) they are
  appended to the reply.
- No Approve card exists (#96), so a reply cannot unblock: the questions end
  with the operator action and "Replying can't lift the cap — this needs the
  operator." (no `?`), and `formatAskReply` drops the reply hint for a
  spend-cap ask. The headline names the operator.
- The run's summary at the cap is `SPEND_CAP_SUMMARY` (no amounts, no env
  names), so WATCH's public GitHub reply leaks nothing; the ask question
  keeps the details for Discord and the CLI (text mode prints it).
- `createTaskExecute` emits it as a `Text` event (NDJSON `Text` frame / CLI
  stderr) and calls `onSpendWarning`; `task run` copies it onto
  `TaskResult.spendWarning` (so `--json` and the NDJSON `result` frame carry
  integer amounts).

## Discord

- `HumanAskReason` gains `spend-cap` (and `askFromUnknown` accepts it).
  `formatAskReply` uses a spend-cap headline and a paused status (not an
  error); `askPingKey` keys a spend-cap ask on its reason only so a schedule
  pings once per cap episode.
- The spawn client validates `result.spendWarning` with
  `spendWarningFromUnknown` (integers only, percent recomputed). Bridge posts
  go through `withSpendWarningPost` with the warning taken from the outbox,
  which appends the warning line rebuilt from the amounts and adds the owner
  to `mentionUserIds`.
- `/status`: `SlashContext.spendLine` (bridge closure over
  `readSpendSnapshot` on its shared DB) → `formatSpendStatusLine`.

## Text lives in one place

`src/agent/spend-notice.ts` is pure formatting (warning line, ask questions,
doctor and status lines, validation); `spend.ts` re-exports `SPEND_CAP_ENV`
and `formatUsd` from it, and only type-imports back, so there is no runtime
cycle.

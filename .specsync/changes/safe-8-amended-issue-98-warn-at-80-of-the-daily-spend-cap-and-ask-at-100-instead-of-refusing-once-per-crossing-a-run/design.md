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
  `spend.finish`, which swaps it for `{ summary: "Needs your input: …",
  filesChanged, ask }` when an ask is pending. `runTask` already maps
  `ExecuteResult.ask` to state `blocked` with verify skipped and no retry
  (AUTONOMY-1), so the run ends `blocked` and `task run` exits 0.
- Hot-file footprint: `execute.ts` swaps `withSpendCap` for
  `createSpendGuard`, adds `onSpendWarning`, and wraps the returned closure
  (`return async (ctx) => spend.finish(await run(ctx))`).

## Warn at 80% (once per crossing)

- After each settle, `SpendLedger.noteWarning({ capMicroUsd, now })` runs one
  IMMEDIATE transaction: read 24 h spend; if ≥ 80% and no `spend_alerts` row
  of kind `warn` for this cap value in the last 24 h, insert one and return
  `SpendWarning { spentMicroUsd, capMicroUsd, percent }`. Concurrent
  processes therefore warn once between them; a new cap value re-arms it; a
  zero cap never warns.
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
  `spendWarningFromUnknown` (integers only, percent recomputed). The bridge
  reply and the schedule post go through `withSpendWarningPost`, which
  appends the warning line rebuilt from the amounts and adds the owner to
  `mentionUserIds`.
- `/status`: `SlashContext.spendLine` (bridge closure over
  `readSpendSnapshot` on its shared DB) → `formatSpendStatusLine`.

## Text lives in one place

`src/agent/spend-notice.ts` is pure formatting (warning line, ask questions,
doctor and status lines, validation); `spend.ts` re-exports `SPEND_CAP_ENV`
and `formatUsd` from it, and only type-imports back, so there is no runtime
cycle.

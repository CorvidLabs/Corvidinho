---
change: a-call-whose-price-is-unknown-stops-and-asks-on-the-owner-s-spend-card-showing-the-amount-as-unknown-when-a-cap-covers
artifact: design
---

# Design

- `src/agent/spend.ts`
  - Ledger: status `unknown` (estimate and cost 0, so it never adds to the
    priced spend and is never shown as $0); `window` adds `unknownCalls`;
    `covering` lists the caps that cover a call with their spend (and unknown
    count); `recordUnknown` inserts one approved unknown-price row; `settle`
    keeps `unknown` rows `unknown` with their tokens (`failed` on an HTTP
    error); `fit` and `noteWarning` carry each scope's `unknownCalls` into
    `SpendTrip` / `SpendWarning`.
  - Guard: the card raise-and-wait is shared (`waitOnCard`: request,
    AUTONOMY-8 note, `waitForDecision`, consume; never throws), used by the
    priced `passOnCard` (unchanged behaviour) and the new `passUnknownOnCard`
    (no `approval` or no owner → the unpriced operator ask before the ledger
    opens; else one card at a time per run, `covering` for the target and
    text, approve → `recordUnknown` → send → settle `unknown`; a no → the
    unpriced ask with the card outcome). An uncovered unpriced call is sent
    unrecorded as before. No price table change, no override key.
  - `spendCardFields({ estimateMicroUsd: null })`: the unknown-price title,
    target every covering cap, amount `unknown (…)`, text saying the cost is
    unknown and never counted as $0.
- `src/agent/spend-notice.ts`: `formatSpend` ("$X + unknown"),
  `SpendTrip.unknownCalls`, the card variant of `spendCapUnpricedAsk`
  (no reply note, both ways on), doctor / `/status` / warning lines through
  `formatSpend`; `spendWarningFromUnknown` keeps a whole positive count.
- `src/agent/spend-outbox.ts`: `takeWarning` adds each scope's unknown count.
- `src/discord/spend-card.ts`: `approvedOutcome` picks
  `SPEND_CARD_UNKNOWN_APPROVED` for an unknown amount.
- `src/watch/owner-ask.ts`: `WATCH_OWNER_ASK_REASONS` (`stuck`,
  `spend-cap`); `noteWatchRunAsk` records spend-cap stops with their own
  log wording (no amounts). `src/discord/watch-ask.ts`: spend-cap stops are
  DMed as `formatWatchSpendStopDm`, gated once per cap episode by the spend
  alert outbox's `claimCapPing` (built over the delivery's DB — no
  `bridge.ts` change), with the claim released on a failed DM.
- `src/discord/schedule-ask.ts`: a spend-cap stop's controls are Continue
  (its `open` custom id, so no new custom-id kind) and Cancel; only the live
  owner's Continue counts and closes it `continued` (`src/scheduler/store.ts`
  `ScheduleAskOutcome`), which hands no answer on (`answeredAsk` reads only
  `answered` / `picked`).
- No schema bump (`spend_ledger.status` and `schedule_runs.ask_outcome` are
  TEXT), no new table, config key, env var or slash command; `package.json`
  untouched.

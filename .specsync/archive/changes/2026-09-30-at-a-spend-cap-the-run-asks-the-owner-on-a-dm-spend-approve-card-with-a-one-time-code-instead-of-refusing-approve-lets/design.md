---
change: at-a-spend-cap-the-run-asks-the-owner-on-a-dm-spend-approve-card-with-a-one-time-code-instead-of-refusing-approve-lets
artifact: design
---

# Design

- `src/agent/spend.ts`
  - `SpendLedger.reserve` is split into a private fit check and insert;
    `reserveApproved({ …, approvedMicroUsd })` runs the fit check again in its
    own IMMEDIATE transaction (re-arming like `reserve`), records one row at
    the estimate whatever it trips, and records nothing for an estimate over
    the approved amount.
  - `createSpendGuard({ approval })`: after a refused reservation of a priced
    call, `passOnCard` looks up the owner (`getOwner`; a caller's env without
    its own allowlist file uses this process's), and with none throws the
    plain ask. Otherwise, one card at a time per guard (a promise chain), it
    re-fits (sends at once if the call fits now), records the `spend` /
    `money` request (`spendCardFields`: title, action, target = tripped
    scopes, amount = estimate, text = who / where / project / spend when
    paused / task excerpt; requester = acting user; waiter =
    `scheduleRunnerId()`; TTL `SPEND_CARD_TTL_MS`), emits the AUTONOMY-8 wait
    note, and waits (`waitForDecision` with the call's own signal). An
    approval it consumes while not aborted → `reserveApproved` → the call is
    sent and settled as usual, plus an approval note. Anything else → the
    card variant of the ask (`denied` / `expired` / `aborted` /
    `unavailable`) as a `SpendCapRefusal`.
- `src/agent/spend-notice.ts`: `spendCapReachedAsk({ …, card })` keeps the
  amounts and the `Stopped at cap` marker, says what the card came to, and
  offers asking again for a new card and code or the operator action;
  `NO_REPLY_NOTE` stays only on the no-card path.
- `src/agent/execute.ts`: `approval` with the task text, the project label
  (`projectLabel(projectKeyFor(cwd))`) and Text-event notes; `chatCompletions`
  never turns a `SpendCapRefusal` into a timeout failure.
- `src/discord/spend-card.ts`: `spendApprovalKind` over `storedApprovalKind`
  (kind `spend`, class `money`, audit `spend-cap`); `bridge.ts` only adds it
  to the engine's kinds. `src/discord/ask-ping.ts`: comments only.
- No schema bump (`approval_requests` from v14 as is), no new table, config
  key, env var or slash command; `package.json` untouched.

Design choices pending Leif (the most conservative option consistent with
the confirmed text; see /home/user/coord/m34-defaults.md approvals and
spend-caps rows):

1. No owner configured: nobody can approve, so the stop keeps the
   operator-action ask at once and raises no card (as the must-ask gate
   refuses at once with no owner).
2. Unpriced-model, invalid-setting and unreadable-ledger stops raise no card
   (there is no price to approve); unknown prices on a card are the later
   spend-caps-c change (SAFE-16 round 13).
3. Card lifetime 4 minutes (below the 5-minute council voice cap), code
   lifetime 2 minutes (the engine's), waiter poll 1 s — code constants, no
   config key.
4. One card per paused call even when it passes two caps: its target names
   both (`total, provider:<id>`). The amount is the pre-call estimate (prompt
   bytes / 3 + a 4096-token reply reserve); "at the amount shown" binds the
   reservation (`reserveApproved` refuses a bigger estimate), while the call
   is still settled to what the provider reports afterwards.
5. No re-fit while the card is open: a lapse is a no even if old spend left
   the window meanwhile (nothing is spent without an answer); the call is
   re-fit only just before a card is raised.
6. Delegate and council workers raise their own cards (the recorded default:
   one card per paused call, no run refused), unlike the must-ask gate, which
   refuses workers; a killed worker's card closes through waiter liveness.
7. The card shows, as quoted data, the acting user id (or `local`), the
   surface, the project label, each tripped cap's spend when it paused and
   the task (up to 1500 characters, the cut marked). Amounts stay on the
   owner's DM; the requester's status only says it waits for the owner's OK.
8. After a no, the owner learns the outcome through the existing spend-cap
   DM (once per cap episode); the channel still says only "💸 Work is paused
   for budget.".
9. No extra SAFE-5 row when the waiting run uses the approval: the engine's
   `spend-cap-approve` rows and the request's `used` status record it.
10. A CLI-only or daemon-only install records the card and waits out the 4
    minutes (the recorded default) rather than stopping at once.

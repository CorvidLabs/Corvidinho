---
change: a-call-whose-price-is-unknown-stops-and-asks-on-the-owner-s-spend-card-showing-the-amount-as-unknown-when-a-cap-covers
artifact: research
---

# Research

Where each piece lived on main (`9ea4005`):

| Piece | Main | This change |
|---|---|---|
| Unpriced call under a cap | `createSpendGuard` throws `SpendCapRefusal(spendCapUnpricedAsk(…))` before the ledger opens, never a card ("no price to approve", REQ-agent-198) | with `approval` and an owner, the call waits for a `spend` card whose amount is unknown; the operator ask stays for no owner / no `approval` |
| Uncovered unpriced call | sent unrecorded | unchanged (SAFE-16.a: "it just runs") |
| Ledger | statuses `reserved` / `actual` / `estimated` / `failed`; `window` → spent, calls, estimatedCalls | adds `unknown` (no amount) and `unknownCalls` |
| Owner spend lines | `formatUsd(spent)` in doctor, `/status`, warning, stop ask, card text | `formatSpend(spent, unknownCalls)` → `$X + unknown` |
| Card engine | `spendApprovalKind` with one approved line | the same kind; the outcome line depends on the amount |
| WATCH stop | `noteWatchRunAsk` records only `stuck`; `spend-cap` drops the thread's row (REQ-watch-086) | records `spend-cap` too; `watch-ask.ts` DMs it with the SAFE-14.a spend-stop text once per cap episode (`claimCapPing`) |
| Daemon / CLI | the card is recorded in `approval_requests` by any process (#334); daemon schedule asks wait on the run row for a bridge (REQ-discord-347) | unchanged plumbing; unknown-price calls now raise that card too |
| Schedule spend-cap stop | Cancel only (REQ-discord-606: "continuing past the cap is not a choice here") | the owner's Continue (its `open` id) closes it `continued`; the next run asks on a card before spending past a cap |
| Price override | none | none (SAFE-16.a) |

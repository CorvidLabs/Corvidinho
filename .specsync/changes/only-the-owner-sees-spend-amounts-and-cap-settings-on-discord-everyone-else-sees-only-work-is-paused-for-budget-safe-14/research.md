---
change: only-the-owner-sees-spend-amounts-and-cap-settings-on-discord-everyone-else-sees-only-work-is-paused-for-budget-safe-14
artifact: research
---

# Research

Every Discord surface that showed spend on main (f687a5a), and where it goes
now:

| Surface | Before | After |
|---|---|---|
| Chat answer / button-pick resume (`bridge.ts`) | `formatAskReply` quoted the spend-cap question; `withSpendWarningPost` appended the 80% line with the owner's mention to any answer | headline only; no warning line; `spendDm.deliver({ stop, warning })` after the post |
| `/work`, `/session start` (`command-handlers/work.ts`, `session.ts`) | question quoted; PR line "paused at the daily spend cap (SAFE-8)"; `slashOwnerNotice` carried the 80% line | headline only; "PR: not opened — Work is paused for budget."; the notice is the ask line and the SAFE-13 line only; DM pass in `finally` |
| Schedule ✅/❌ post and own ask post (`scheduler/service.ts`) | `withSpendWarningPost` on both; the ask quoted the question | no warning; ask headline only; `spendDm` pass after the run |
| Daemon pending-ask pass (`deliverPendingAsks` → `postRunAsk`) | posted `schedule_runs.ask_question` (amounts) publicly | headline only; the stored question goes to the owner by DM when the post claims the episode's ping |
| `/status` (`command-handlers/status.ts`, `bridge.ts`) | spend line for any allowlisted user | owner (ADMIN re-check) only; others "Spend: Work is paused for budget." while paused, else nothing |
| Answer footer (DISCORD-15.a, #297) | owner-only tokens and cost | unchanged |
| WATCH GitHub comment, daemon log, CLI | `SPEND_CAP_SUMMARY` "Paused before calling the model: the operator's daily spend cap (SAFE-8) needs attention…" | "Work is paused for budget."; daemon logs and CLI keep the details (operator-local) |

DM path: the gateway `sendDm` (`handlers.sendDm`, already used by the forget
cards and the MEMORY-7.a private replies) is reused; no new DM helper. #313
adds an owner DM for stuck WATCH asks in its own files
(`src/discord/watch-ask.ts`, `src/watch/owner-ask.ts`); main has no generic
owner-DM helper, so `spend-dm.ts` is spend-specific and shares no file with
#313 beyond `bridge.ts` (different lines).

Delivery state: the 80% warning already has durable claim / release in
`spend_alerts` (`createSpendAlertOutbox().takeWarning`), so a failed DM
releases it and the next pass claims it again. A cap stop has no row (`stop`
rows are spend-caps-b), so its DM is held in memory until sent. The owner
ping once per cap episode (`claimCapPing`) is the natural dedupe for the
stop's DM.

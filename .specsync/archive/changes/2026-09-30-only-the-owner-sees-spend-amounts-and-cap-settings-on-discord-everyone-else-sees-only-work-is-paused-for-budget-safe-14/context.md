---
change: only-the-owner-sees-spend-amounts-and-cap-settings-on-discord-everyone-else-sees-only-work-is-paused-for-budget-safe-14
artifact: context
---

# Context

Issue #98 (SAFE-8 / SAFE-14..16, M4 "Safe autonomy"). #160 built the daily
spend cap and, as REQ-discord-098 specified then, showed the amounts and the
setting name to whoever asked for the run. The visibility question
(issue #98 comment, 2026-09-26) went to Leif. His answer (interview
2026-09-28, round 4, /home/user/coord/interview-2026-09-28.md): "non-owners
see only 'paused for budget', no amounts or setting names", captured on main
as **SAFE-14.a** "Only I see spend amounts and cap settings; everyone else
only sees that work is paused for budget." Round 9 settled the footer:
"model + time for everyone; tokens + cost only in the owner's runs" —
DISCORD-15.a, already met on main by #297, which this change must not
regress.

Leaks left on main (f687a5a) that this change closes:

- `formatAskReply` quoted the spend-cap question (spend, estimate, cap,
  `CORVIDINHO_DAILY_SPEND_CAP_USD`) in the public post on chat, button picks,
  `/work`, `/session start`, schedule posts and the bridge tick's daemon
  pending-ask pass (`deliverPendingAsks` → `postRunAsk`, from
  `schedule_runs.ask_question`).
- The 80% warning line with amounts (`withSpendWarningPost`,
  `slashOwnerNotice`) rode whichever post went out next, a non-owner's answer
  included.
- `/status` showed the spend line (amounts, or "set
  CORVIDINHO_DAILY_SPEND_CAP_USD") to any allowlisted user.
- The headline, status, slash owner notice, `/work` PR line and
  `SPEND_CAP_SUMMARY` named "the daily spend cap" / "(SAFE-8)".

Out of scope (other slices): per-provider caps and per-scope lines
(spend-caps-b, SAFE-14/15/16), the Approve card for the 100% ask (spend-card,
SAFE-18..20 / AUTONOMY-8), the forget card / approvals engine (another PR in
flight), #232 / #233, and #313 (loop guards; its WATCH stuck-ask DMs change
the scheduler `onTick` line in bridge.ts, so this change hands the spend DM
to the scheduler as its own `spendDm` option instead of touching that line).
No new hi criteria were captured: SAFE-14.a and DISCORD-15.a are already on
main.

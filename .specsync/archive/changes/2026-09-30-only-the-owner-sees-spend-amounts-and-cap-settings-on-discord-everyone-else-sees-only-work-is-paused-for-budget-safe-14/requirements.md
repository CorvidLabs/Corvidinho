---
change: only-the-owner-sees-spend-amounts-and-cap-settings-on-discord-everyone-else-sees-only-work-is-paused-for-budget-safe-14
artifact: requirements
---

# Requirements

Confirmed HI (already captured on main from Leif's 2026-09-28 interview,
round 4; nothing new is captured in this change):

- **SAFE-14.a**: "Only I see spend amounts and cap settings; everyone else
  only sees that work is paused for budget."
- Must not regress **DISCORD-15.a** (round 9): "Tokens and cost show only in
  my own runs' footers; everyone else sees model and time."

Canonical requirements changed (see deltas):

- Modified **REQ-discord-098**: every spend-cap post is "💸 Work is paused for
  budget." (no question quote) on chat, button picks, `/work`, `/session
  start`, schedule posts and the daemon pending-ask pass; the `/work` PR
  line, the slash owner notice and the statuses say the same; the 80% warning
  never rides a channel post and goes to the owner by DM after each run and
  on every tick; a cap stop's details go to the owner by DM once per cap
  episode; a failed DM keeps its claim and is retried; the `/status` spend
  line is owner-only (others: "Spend: Work is paused for budget." while
  paused); new acceptance bullets.
- Modified **REQ-discord-215**: the 80% warning no longer rides a collapsed
  answer, so it adds no owner ping; acceptance bullets updated.
- Modified **REQ-discord-347**: the daemon pending-ask post of a spend-cap
  ask carries no question or warning and hands the stored question to the
  owner's DM pass.
- Modified **REQ-discord-734**: `appendPostLine` now carries a SAFE-13 line
  or a slash owner notice (not the 80% warning); the test name follows.
- Modified **REQ-discord-071**: the SAFE-13 line no longer shares a post with
  the SAFE-8 warning.
- Modified **REQ-agent-098**: `SPEND_CAP_SUMMARY` is `SPEND_PAUSED_TEXT`
  "Work is paused for budget."; `spendPaused` / `formatSpendPublicStatusLine`
  give the only spend line anyone but the owner sees.

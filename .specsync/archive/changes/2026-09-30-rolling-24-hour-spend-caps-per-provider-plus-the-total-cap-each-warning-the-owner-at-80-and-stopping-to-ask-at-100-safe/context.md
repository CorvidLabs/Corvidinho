---
change: rolling-24-hour-spend-caps-per-provider-plus-the-total-cap-each-warning-the-owner-at-80-and-stopping-to-ask-at-100-safe
artifact: context
---

# Context

Issue #98 (M4 "Safe autonomy"): rolling 24 h spend caps per provider and in
total, warning at 80% and asking at 100%. #160 built the total cap
(`CORVIDINHO_DAILY_SPEND_CAP_USD`, SAFE-8 as amended) and #317 made spend
owner-only (SAFE-14.a: amounts and cap stops go to the owner by DM, everyone
else sees "Work is paused for budget."). The v0.0.36 rollup on #98 left
SAFE-14 and SAFE-15 partial: one total cap, no per-provider cap, so there is
nothing to warn or stop at per provider.

Confirmed HI, already captured on main from Leif's 2026-09-28 interview
(round 4, /home/user/coord/interview-2026-09-28.md); nothing new is captured
here:

- **SAFE-14** "It keeps rolling 24-hour spend caps per provider plus a total
  cap, and tracks spend against each."
- **SAFE-15** "It warns at 80% of a cap and stops and asks at 100%, for each
  cap."

Must not regress: SAFE-14.a (#317), SAFE-16 (unknown price stays unknown),
SAFE-8, DISCORD-15.a. #320 gave `providerId` (the endpoint host) and #325
(landed during this change, base moved to 7090656) the AGENT-11 fallback
chain, which already treats `SpendCapRefusal` as no model failure; this
change keeps every cap stop a `SpendCapRefusal` and does not touch
`src/agent/execute.ts` or `src/agent/shell-gate.ts`.

Out of scope: the Approve card that continues past a cap (spend-card: SAFE-8,
SAFE-19 money, the "asks on an Approve card" half of SAFE-15), unknown-price
ledger rows (spend-caps-c), WATCH cap stops reaching the owner (spend-card),
#232 / #233.

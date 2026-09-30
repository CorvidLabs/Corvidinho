---
id: only-the-owner-sees-spend-amounts-and-cap-settings-on-discord-everyone-else-sees-only-work-is-paused-for-budget-safe-14
state: verifying
type: feature
base_commit: f687a5a87d0371d41f8412b96a93dbc917dbbdb4
---

# Only the owner sees spend amounts and cap settings on Discord; everyone else sees only 'Work is paused for budget.' (SAFE-14.a): spend-cap posts, the /work PR line, the slash owner notice and SPEND_CAP_SUMMARY say only that; the question quote is dropped on every path including the daemon pending-ask pass; the 80% warning never rides a channel post and, with a cap stop's details, goes to the owner by DM (src/discord/spend-dm.ts, retried every scheduler tick); the /status spend line is owner-only

## Intent

Only the owner sees spend amounts and cap settings on Discord; everyone else sees only 'Work is paused for budget.' (SAFE-14.a): spend-cap posts, the /work PR line, the slash owner notice and SPEND_CAP_SUMMARY say only that; the question quote is dropped on every path including the daemon pending-ask pass; the 80% warning never rides a channel post and, with a cap stop's details, goes to the owner by DM (src/discord/spend-dm.ts, retried every scheduler tick); the /status spend line is owner-only

## Affected Canonical Specs

- `discord`
- `agent`

## Acceptance Criteria

- Through startBridge with a memory DB, the fake gateway recording replies and DMs: a spend-cap stop on chat, a button-pick resume, /work, /session start, a schedule run's own post and the bridge tick's daemon pending-ask pass posts only '💸 Work is paused for budget.' (plus the schedule line on a schedule post and the owner mention once per cap episode) — no question quote, no amount, no cap value, no setting name, no reply hint; the /work PR line reads 'PR: not opened — Work is paused for budget.' and the slash owner notice '💸 <@owner> <label>: Work is paused for budget.'; SPEND_CAP_SUMMARY and SPEND_CAP_STATUS carry the same generic text. The owner gets the stop's details (the spend-cap question with spend, estimate, cap and the setting) by DM once per cap episode, with the channel ping, and the 80% warning by DM only — never in a chat answer, a split answer part, a collapsed edit, a fallback reply, a slash owner notice or a schedule post — taken from the outbox once, after each bridge run and on every scheduler tick; a DM that does not go out keeps its claim, is retried on the next pass and is logged once per failure streak with no amounts. /status shows the owner the 24 h spend line (plus a note while a spend DM waits); anyone else sees no spend line, and only 'Spend: Work is paused for budget.' while runs stop at the cap. DISCORD-15.a is unchanged: someone else's answer footer shows model and time only, the owner's footer keeps tokens and cost. The flipped and new tests fail on main's sources and pass on the branch; no env var, config key, table, column or schema version.

## No-spec Rationale

Not applicable

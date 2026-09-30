---
module: discord
change: at-a-spend-cap-the-run-asks-the-owner-on-a-dm-spend-approve-card-with-a-one-time-code-instead-of-refusing-approve-lets
---

# Delta: discord (the bridge's card engine answers the spend card: money, Approve + code, SAFE-8 / SAFE-8.a / SAFE-19 / SAFE-20)

## Added

### REQUIREMENT REQ-discord-198

The bridge SHALL register the `spend` card kind on its one Approve/Deny card
engine (REQ-discord-096), next to the forget and must-ask kinds, so a model
call a run held at a spend cap (REQ-agent-198) reaches the owner as a DM
card (SAFE-8, SAFE-18). `src/discord/spend-card.ts` `spendApprovalKind`
SHALL be a stored kind over `approval_requests` (`storedApprovalKind`) with
class `money` — Approve answers with the code step and DMs the one-time code
apart; only the right code typed into the form, for that card and the exact
action it shows, before it expires, approves it (SAFE-19) — audit prefix
`spend-cap` (`spend-cap-card`, `-approve`, `-deny`, `-expire` SAFE-5 rows),
"nothing was spent" as what a no leaves undone, and `SPEND_CARD_APPROVED` as
the approved outcome. Approve SHALL only record the decision: the waiting
run reads it, uses it once and sends exactly the call the card showed, at
that amount (SAFE-8.a). Any process on the data dir SHALL be able to raise
the card (chat and slash runs, schedules, WATCH, the daemon, delegate and
council workers, the CLI); the running bridge delivers it on the engine's
own poll and after each chat run. The card SHALL show, before it, the run's
task and context as quoted-data text, then the action, target and amount one
line each; the requester and channel SHALL see no amounts (SAFE-14.a). Deny,
no answer before it lapses, a late code, a press or code from anyone but the
owner, or a card whose waiting process is gone (its `<pid>:<proc start>`)
SHALL be a no (SAFE-20): the card closes and nothing is spent. Nothing else in
the bridge changes for it.

Acceptance Criteria
- With the engine and a run paused near its cap, the owner is DMed the task as quoted data first, then the card with `**Spend past a cap — asks first (SAFE-8) · from cli**`, `Action: send one model call to gpt-4o via llm.test`, `Target: total`, `Amount: ~$… (this one call's estimate)` and "Approve also needs a one-time code I send you then (SAFE-19)."; Approve alone sends nothing; Approve plus the code DMed apart sends the call once and answers with `SPEND_CARD_APPROVED`; the request ends `used`; `spend-cap-card` `ok` and `spend-cap-approve` `started` then `ok` are on the audit chain.
- Deny on the card: nothing is sent and the card says "Denied by you — nothing was spent."; the run's ask names the denied card.
- Another user's Approve and code submit are answered "Only the owner can answer this card." and nothing is sent.
- A code typed after the card lapsed is a no: nothing is sent and the request is `expired`.
- A pending spend card whose waiting process is gone is closed on the next pass as a no, with no card sent.
- The bridge (fake gateway, owner from the allowlist file) DMs a spend card another process recorded, with its `cvok:spend:approve:<id>` button, and Approve answers with the code step (not "This card is no longer handled.") and DMs an 8-character code.
- These tests fail on main's sources.

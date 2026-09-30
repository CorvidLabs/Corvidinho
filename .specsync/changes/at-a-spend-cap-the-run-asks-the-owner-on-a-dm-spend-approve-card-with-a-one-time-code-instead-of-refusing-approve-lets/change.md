---
id: at-a-spend-cap-the-run-asks-the-owner-on-a-dm-spend-approve-card-with-a-one-time-code-instead-of-refusing-approve-lets
state: approved
type: feature
base_commit: 519c58fd304adeb29ea4867ce7eb23426dda595c
---

# At a spend cap the run asks the owner on a DM spend Approve card with a one-time code instead of refusing; Approve lets only the paused call through at the amount shown and the next call past the cap asks again (SAFE-8, SAFE-8.a, SAFE-15, SAFE-19 money)

## Intent

At a spend cap the run asks the owner on a DM spend Approve card with a one-time code instead of refusing; Approve lets only the paused call through at the amount shown and the next call past the cap asks again (SAFE-8, SAFE-8.a, SAFE-15, SAFE-19 money)

## Affected Canonical Specs

- `agent`
- `discord`

## Acceptance Criteria

- With an owner configured and a spend cap set, a priced model call whose estimate would pass the total cap or its provider's cap is held, not refused: the run records one spend Approve card (kind spend, class money) on the shared approvals store showing the action (send one model call to <model> via <provider>), the target (the tripped scope(s): total, provider:<id>) and the amount (that call's estimate), with the task and project label as quoted data, and says once in a Text event that it is waiting for the owner's OK (the live status shows the must-ask wait line; no amounts). The bridge's card engine DMs it to the owner; Approve alone sends nothing; Approve plus the one-time code (SAFE-19) lets exactly that call through, recorded once at the amount shown (SpendLedger.reserveApproved after a re-fit check), and the next call past the cap raises a new card and code (SAFE-8.a). Deny, no answer before the card lapses (4 min, below the council voice and LLM request timeouts), a late code, a run that is gone (waiter pid + start time), a stop or the per-request timeout while waiting is a no (SAFE-20): nothing is sent or spent and the attempt ends blocked with a spend-cap ask whose question says what the card came to and how to continue, without the reply note; the summary stays 'Work is paused for budget.' (SAFE-14.a) and a cap stop is never a model failure (no AGENT-11 fallback). One card per paused call, at most one open per run, none refused because another run's card is open. With no owner configured, and for unpriced, invalid-setting or ledger stops, the operator-action ask stays as on main. A CLI-only or daemon-only install records the card and waits out its TTL. The new tests fail on main's sources and pass on the branch; no schema bump; no new config key.

## No-spec Rationale

Not applicable

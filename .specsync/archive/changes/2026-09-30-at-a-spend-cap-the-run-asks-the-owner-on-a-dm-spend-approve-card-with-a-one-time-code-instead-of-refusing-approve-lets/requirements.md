---
change: at-a-spend-cap-the-run-asks-the-owner-on-a-dm-spend-approve-card-with-a-one-time-code-instead-of-refusing-approve-lets
artifact: requirements
---

# Requirements

Confirmed HI: SAFE-8, SAFE-19, SAFE-15, AUTONOMY-8 (on main) and SAFE-8.a
(captured in this change with `hi`, Leif's 2026-09-30 round-13 decision);
related SAFE-14.a, SAFE-18, SAFE-20.

Canonical requirements changed (see deltas):

- Added **REQ-agent-198**: with an owner configured and `approval` given, a
  priced call past a cap is held for the owner's `spend` card (class money:
  Approve plus the one-time code); one card per paused call, at most one open
  per run, none refused for another run's card; action / target (tripped
  scopes) / amount (that call's estimate) plus task and context as data; the
  AUTONOMY-8 wait note (no amounts); only an approval used once lets exactly
  that call through (`reserveApproved`, re-fit), and the next call past a cap
  asks again (SAFE-8.a); deny, lapse, late answer, abort or unavailable is a
  no — nothing sent or recorded, the ask names the card — and never a model
  failure; no owner, no `approval`, unpriced, invalid or ledger stops keep the
  operator ask; a 4-minute card, below the council voice and request timeouts.
- Added **REQ-discord-198**: the bridge registers the `spend` kind (money,
  audit `spend-cap`, "nothing was spent"); Approve only records the decision;
  owner-only presses; deny, lapse, late code or a gone waiter is a no.
- Modified **REQ-agent-098**: the 100% stop waits for the owner's card first
  when an owner is configured; the ask comes with no card (no owner, no
  `approval`, unpriced, invalid, ledger) or after the card came to no; the
  runner never sends past the cap except the one approved call; the Approve
  card is REQ-agent-198 (no longer "not part of this requirement").
- Modified **REQ-agent-114**: each cap's stop asks on the owner's card (the
  target names the tripped scopes); the operator ask stays for no owner and
  the invalid and unpriced stops.

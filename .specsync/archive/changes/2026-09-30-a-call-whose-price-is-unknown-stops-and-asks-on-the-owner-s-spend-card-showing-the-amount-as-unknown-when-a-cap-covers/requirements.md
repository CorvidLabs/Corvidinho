---
change: a-call-whose-price-is-unknown-stops-and-asks-on-the-owner-s-spend-card-showing-the-amount-as-unknown-when-a-cap-covers
artifact: requirements
---

# Requirements

Confirmed HI: SAFE-16 and AUTONOMY-8 (on main) and SAFE-16.a (captured in this
change with `hi`, Leif's 2026-09-30 round-13 decision); related SAFE-8 /
SAFE-8.a, SAFE-14.a, SAFE-15, SAFE-18..20, AUTONOMY-6.a.

Canonical requirements changed (see deltas):

- Added **REQ-agent-199**: an unpriced call under a covering cap waits for the
  owner's `spend` card (money) whose amount reads unknown and whose target
  names every covering cap; Approve plus the code lets exactly that call
  through, recorded `unknown` (no amount); a no stops it with the unpriced ask
  naming the card; no covering cap → it runs unrecorded; no owner → the
  operator ask; no price override; `SpendWindow.unknownCalls` and "$X +
  unknown" on every owner spend line; every surface stops and asks before
  spending over a cap.
- Added **REQ-discord-199**: the bridge DMs a WATCH spend-cap stop's details
  to the owner once per cap episode; the unknown-price card's approved
  outcome line.
- Added **REQ-watch-099**: a WATCH run stopped at a spend cap is recorded for
  the bridge (reason `spend-cap`), log lines with no amount.
- Modified **REQ-agent-098**, **REQ-agent-114**, **REQ-agent-198**: the
  unpriced stop asks on the card when an owner is configured (no longer "no
  card, no price to approve").
- Modified **REQ-discord-086** (stuck asks only as stuck posts; spend-cap
  stops per REQ-discord-199), **REQ-discord-198** (the unknown-price outcome
  line), **REQ-discord-606** (a spend-cap stop carries the owner's Continue
  and Cancel; Continue closes it `continued`, no answer handed on).
- Modified **REQ-watch-086**: a spend-cap stop is handed over too (no longer
  dropped).

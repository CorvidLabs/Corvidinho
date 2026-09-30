---
id: a-call-whose-price-is-unknown-stops-and-asks-on-the-owner-s-spend-card-showing-the-amount-as-unknown-when-a-cap-covers
state: implementing
type: feature
base_commit: f7258afa99d485a8b93d3950dd890ac02fe2f59c
---

# A call whose price is unknown stops and asks on the owner's spend card showing the amount as unknown when a cap covers it (recorded unknown, owner lines read $X + unknown, no price override), and every surface asks before spending over a cap: WATCH spend-cap stops reach the owner by DM and a schedule's spend-cap stop can go on through the card (SAFE-16, SAFE-16.a, AUTONOMY-8)

## Intent

A call whose price is unknown stops and asks on the owner's spend card showing the amount as unknown when a cap covers it (recorded unknown, owner lines read $X + unknown, no price override), and every surface asks before spending over a cap: WATCH spend-cap stops reach the owner by DM and a schedule's spend-cap stop can go on through the card (SAFE-16, SAFE-16.a, AUTONOMY-8)

## Affected Canonical Specs

- `agent`
- `discord`
- `watch`

## Acceptance Criteria

- With a spend cap covering the call (the total cap, its provider's cap, or both) and an owner configured, a model call whose price is unknown is held, not sent, and asks the owner on a DM spend card (kind spend, class money: Approve plus the one-time code) whose Amount reads unknown (never $0), whose Target names every covering cap and whose title says Spend at an unknown price; Approve plus the code lets exactly that call through, recorded in spend_ledger with status unknown (no amount), and the next such call asks again; deny, no answer, a late code or a stop sends and records nothing and the run ends blocked with the unpriced spend-cap ask naming the card, without the reply note. With no cap covering it the call just runs, unrecorded, with no card; with no owner (or no card path) the operator ask comes at once as before; there is no price override. The rolling window counts unknownCalls, and every owner spend line (doctor, the owner's /status, the 80% warning and its DM, the stop ask and the card context) reads $X + unknown while the window holds such a call; non-owners still see only Work is paused for budget. A WATCH run stopped at a spend cap is recorded in watch_owner_asks (reason spend-cap) and the bridge DMs the owner the stop's details with the GitHub thread once per cap episode, while GitHub shows only the pause. A schedule's spend-cap stop carries Continue (the owner's only; closes it continued with no answer handed on, so the next run asks on a card before any call past a cap) and Cancel. A cross-surface test drives chat, slash /session and /work, ask buttons, schedules, the daemon, WATCH, the CLI and delegate/council workers through their real spawn env and shows each stops and asks before spending over the total cap, a provider cap and at an unknown price. The new tests fail on main's sources and pass on the branch; no schema bump, no new config key or env var.

## No-spec Rationale

Not applicable

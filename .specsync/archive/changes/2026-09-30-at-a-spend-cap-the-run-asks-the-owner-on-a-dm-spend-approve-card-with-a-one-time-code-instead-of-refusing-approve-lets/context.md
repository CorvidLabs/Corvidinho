---
change: at-a-spend-cap-the-run-asks-the-owner-on-a-dm-spend-approve-card-with-a-one-time-code-instead-of-refusing-approve-lets
artifact: context
---

# Context

Issue #98 (M4 "Safe autonomy"): spend caps warn at 80% and **ask** at 100%.
#160 built the total cap, #317 made spend owner-only (SAFE-14.a) and #328 added
per-provider caps (SAFE-14 / SAFE-15). The v0.0.36 rollup on #98 left SAFE-8
and SAFE-15 partial: at 100% the run stops with an operator-action ask ("raise
or unset the cap and restart"), and no Approve card lets the owner continue.
#316 landed the Approve/Deny card engine with one-time codes and the `money`
class (SAFE-18..20), but nothing raised a money card; #319 added the must-ask
gate's cards and its "waiting for the owner's OK" Text event; #325's AGENT-11
fallback already treats a `SpendCapRefusal` as no model failure.

Confirmed HI (Leif's 2026-09-28 interview, /home/user/coord/interview-2026-09-28.md):

- Already on main: **SAFE-8** "When a daily spend cap is set, I get a warning
  at 80% of it, and at 100% the agent asks me (an Approve card to continue)
  instead of refusing or quietly running up the bill."; **SAFE-19**
  "Destructive actions and money actions also need a one-time code I type
  back; the code is valid once, only for that action, and expires quickly.";
  **SAFE-15** "It warns at 80% of a cap and stops and asks at 100%, for each
  cap."; **AUTONOMY-8** "It asks before any spend that would go over a cap."
- Captured in this change with `hi` (round 13, 2026-09-30): **SAFE-8.a**
  "One Approve and its code let only the paused call through, at the amount
  shown; the next call past the cap raises a new card and code."

Out of scope: unknown prices on a card (SAFE-16 round 13, the later
spend-caps-c change), a session-wide "allow the rest", moving SAFE-1 consent
onto cards, #232 / #233, and the stop button (stop-button-1 builds
`src/discord/run-control.ts` and the bridge run paths in parallel; this change
only registers its card kind in `bridge.ts`).

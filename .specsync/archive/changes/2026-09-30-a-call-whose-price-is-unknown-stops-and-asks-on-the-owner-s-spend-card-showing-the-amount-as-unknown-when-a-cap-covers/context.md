---
change: a-call-whose-price-is-unknown-stops-and-asks-on-the-owner-s-spend-card-showing-the-amount-as-unknown-when-a-cap-covers
artifact: context
---

# Context

Issue #98 (M4 "Safe autonomy"): spend caps warn at 80% and ask at 100%, and an
unknown price is never free. #160 built the total cap, #317 made spend
owner-only (SAFE-14.a), #328 added per-provider caps (SAFE-14 / SAFE-15) and
#334 the owner's DM spend card (SAFE-8 / SAFE-8.a, class `money`). On main
(`9ea4005`) an unpriced model under a cap still stopped at once with an
operator ask ("switch to a priced model or unset the cap") and no card, since
#334 raised cards only for priced calls. The v0.0.36 rollup on #98 also found
that a WATCH run stopped at a cap reached nobody: `noteWatchRunAsk` queued only
stuck asks, and GitHub shows only "Work is paused for budget.". A schedule's
spend-cap stop had Cancel only ("continuing past the cap is not a choice
here"), written before the spend card existed.

Confirmed HI (Leif's 2026-09-28 interview, /home/user/coord/interview-2026-09-28.md):

- On main: **SAFE-16** "An unknown model price counts as unknown and shows as
  unknown, never as free." and **AUTONOMY-8** "It asks before any spend that
  would go over a cap."
- Captured in this change with `hi` (round 13, 2026-09-30): **SAFE-16.a** "A
  call whose price is unknown stops and asks on a card that shows the amount
  as unknown when a cap covers it; with no cap covering it, it just runs;
  there is no price override."

Planned scope: /home/user/coord/pr-spend-caps-c.json (M3/M4 synthesis) and the
spend-caps rows of /home/user/coord/m34-defaults.md. Out of scope: a price
override (none may be added), #232 / #233, the stop button (stop-button-2) and
the CLI worktree (cli-worktree), which build in parallel; `bridge.ts` is not
touched.

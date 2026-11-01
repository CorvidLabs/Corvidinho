---
change: at-a-spend-cap-a-flat-priced-tool-call-web-search-gif-search-waits-on-the-owner-s-spend-approve-card-like-a-model-call
artifact: context
---

# Context

SAFE-8 (captured on main, `hi/safe.md`): "When a daily spend cap is set, I
get a warning at 80% of it, and at 100% the agent asks me (an Approve card to
continue) instead of refusing or quietly running up the bill." SAFE-8.a
(captured): "One Approve and its code let only the paused call through, at
the amount shown; the next call past the cap raises a new card and code."
Leif's #318 go (2026-09-30 22:40) adopted #334's REQ-agent-098 wording: "the
run waits for the owner's spend Approve card".

Gap on main (49273ff): model calls, condense, review and headless-CLI turns
wait on the owner's spend card at 100% (REQ-agent-198). Flat-priced tool
calls do not: `reserveFlatSpend` (`src/agent/spend.ts`) returns `stopped`
with `spendCapReachedAsk` and no card, `plugins/web/search.ts` and
`plugins/gif/giphy.ts` throw the spend-cap refusal, `src/agent/execute.ts`
ends the attempt, and `tests/web.search.test.ts` pins the refusal.

No new hi capture: SAFE-8, SAFE-8.a, SAFE-14.a, SAFE-18, SAFE-19 and SAFE-20
are all on main. Out of scope: COS briefings at a cap; delivery on
daemon-only or CLI-only installs (the card is recorded and lapses there, as
for a model call).

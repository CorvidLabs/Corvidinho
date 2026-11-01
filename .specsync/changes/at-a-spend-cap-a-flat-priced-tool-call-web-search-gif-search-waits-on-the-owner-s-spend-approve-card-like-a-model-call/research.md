---
change: at-a-spend-cap-a-flat-priced-tool-call-web-search-gif-search-waits-on-the-owner-s-spend-approve-card-like-a-model-call
artifact: research
---

# Research

- `src/agent/spend.ts` `createSpendGuard`: `passOnCard` already holds a priced
  model call for the owner's card — owner check (`getOwner` via `ownerEnv`),
  the run's one-card turn (`cardTurn`), re-fit, `spendCardFields`,
  `waitOnCard` (`ApprovalStore.request` kind `spend` / class `money`,
  `waitForDecision`, `consume`), `reserveApproved`, notes — but it throws
  `SpendCapRefusal` and leaves the ask in `pending` for `finish`, which a
  tool call must not do (the tool's own `spendAsk` ends the attempt, and
  `finish` would drop `unreportedEditTools`).
- `reserveFlatSpend` (sync) opens its own ledger DB (`opts.db` seam or the
  data dir) and settles on it; its two callers (`braveWebSearch`,
  `giphyGifSearch`) are async.
- `PluginHandlerArgs` already carries the run's `signal` and `review`
  context from the tool loop through `runPlugin`; `corvidinho plugins run`
  passes neither.
- The plugin's env is `deps.env ?? process.env`; the guard's is the run's
  env (the same process env outside tests).
- `spendCapReachedAsk({ …, card })` already words the no for a card; the
  Discord card engine (`src/discord/spend-card.ts`) DMs any `spend` request
  on the data dir, so no bridge change is needed.

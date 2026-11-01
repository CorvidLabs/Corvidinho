---
change: at-a-spend-cap-a-flat-priced-tool-call-web-search-gif-search-waits-on-the-owner-s-spend-approve-card-like-a-model-call
artifact: design
---

# Design

- `src/agent/spend.ts`
  - `passOnCard` becomes `holdOnCard(on: { db, ledger, tool? }, call, trips,
    signal)`, which returns `{ ok: true, id } | { ok: false, ask }` and never
    throws; the model path wraps it (`stop(ask)` on a no, as before). The
    card's approvals store is `on.db` (`waitOnCard(cardDb, …)`; the unknown
    price card passes the guard's DB as before).
  - `SpendGuard.flatCard: FlatSpendCard` (only with `approval`): runs
    `holdOnCard` on the flat call's own ledger and DB with `tool`, in the
    run's shared card turn; its no is returned, not left for `finish`.
  - `spendCardFields({ tool })`: action `send one <tool> via <provider>`.
  - `reserveFlatSpend` is async and takes `tool`, `card?`, `signal?`: on a
    refused reservation with `card`, it asks; approved ⇒ `held` on the row
    `reserveApproved` recorded; a no ⇒ `stopped` with the card's ask; no
    `card` ⇒ `stopped` as before. Invalid setting / ledger stops come first
    and never ask.
- `src/plugins/types.ts` / `src/plugins/run.ts`: `PluginHandlerArgs.spendCard`
  and `RunOptions.spendCard`, passed through.
- `src/agent/execute.ts`: `LoopArgs.spendCard = spend.flatCard`, passed to
  `runPlugin` for offered tools.
- `plugins/web/search.ts`, `plugins/web/commands.ts`, `plugins/gif/giphy.ts`,
  `plugins/gif/commands.ts`: `spendCard` dep from `ctx.spendCard`, handed to
  `reserveFlatSpend` with the run's signal and the tool's name.
- No schema, table, config key, env var, CLI or Discord change.

Design choices pending Leif (the most conservative option consistent with
the captured text):

1. The no's ask is the model path's `spendCapReachedAsk(…, card)`, naming
   the card and what it came to (its wording still says "provider call", as
   today's flat ask does).
2. The card's amount uses the model card's wording `~$X (this one call's
   estimate)` for the flat price ($0.005 is "about" per Leif's #318 note); a
   GIPHY search past the cap shows `~$0.00`.
3. A $0 `gif-search` with the window already past the cap still raises a
   money card (Approve + code) rather than running free: the captured SAFE-8
   asks at 100% and the acceptance asks gif-search to behave the same.
4. Only an agent run (the tool loop with the run's guard) can raise the
   card; `corvidinho plugins run web-search` past the cap keeps the plain
   spend-cap ask (no run to wait).
5. The card waits on the run's stop signal only; the per-request LLM timeout
   does not wrap a tool call, so the card's own 4-minute lifetime bounds the
   wait.

---
module: plugins
change: at-a-spend-cap-a-flat-priced-tool-call-web-search-gif-search-waits-on-the-owner-s-spend-approve-card-like-a-model-call
---

# Delta: plugins (web-search and gif-search ask on the calling run's spend card at the cap — SAFE-8 / SAFE-8.a)

## Added

### REQUIREMENT REQ-plugins-398

`PluginHandlerArgs` SHALL carry an optional `spendCard` (`FlatSpendCard`,
REQ-agent-398): the calling run's SAFE-8 spend card, set by the agent tool
loop and passed to the handler by `runPlugin` (`RunOptions.spendCard`), and
absent for every other caller (`corvidinho plugins run`, the `/work` PR
step). `web-search` (REQ-plugins-318) and `gif-search` (REQ-plugins-3182)
SHALL hand `ctx.spendCard` and the run's abort signal to `reserveFlatSpend`
(REQ-agent-098, with `tool` `web-search` / `gif-search`), so a call whose
price would pass the total cap waits on the owner's spend card (SAFE-8,
SAFE-8.a): approved, its one request is sent and its reservation settles as
before; on a no, or with no card, the stopped reservation keeps today's
result — `ok: false`, exit 2, `data.code` `spend-cap`, the error `<tool>
spend-cap: refused: Work is paused for budget. (SAFE-8)` (no amount, cap or
setting name, SAFE-14.a) and the ask in `PluginHandlerResult.spendAsk`, with
nothing sent. No other command reads `spendCard`.

Acceptance Criteria
- `web-search` called with `spendCard` at $0.9980 of a $1.00 cap: one `spend` / `money` card (`send one web-search via api.search.brave.com`, `total`, `~$0.0050 (this one call's estimate)`); approved, one request goes out and the row settles `actual` 5000, with no `spendAsk` and nothing outside the fence naming an amount, `CORVIDINHO_`, `SAFE-8` or spend; the next search raises a new card and, denied, sends nothing and returns exit 2, `data.code` `spend-cap`, the `web-search spend-cap: refused: Work is paused for budget. (SAFE-8)` error and the card in `spendAsk`.
- `gif-search` with `spendCard` and the window past the cap does the same at $0 (`send one gif-search via api.giphy.com`, `~$0.00 (this one call's estimate)`).
- Without `spendCard` both keep stopping at the cap with the spend-cap ask, as before.
- The tool loop's card reaches the `web-search` handler through `runPlugin`.
- These tests fail on main's sources.

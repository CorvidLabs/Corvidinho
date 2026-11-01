---
module: agent
change: at-a-spend-cap-a-flat-priced-tool-call-web-search-gif-search-waits-on-the-owner-s-spend-approve-card-like-a-model-call
---

# Delta: agent (a flat-priced tool call at the spend cap waits on the owner's spend Approve card — SAFE-8 / SAFE-8.a)

## Added

### REQUIREMENT REQ-agent-398

At 100% of the total spend cap a flat-priced tool call SHALL ask the owner on
the spend Approve card instead of refusing, as a priced model call does
(SAFE-8, captured on main, `hi/safe.md`: "When a daily spend cap is set, I
get a warning at 80% of it, and at 100% the agent asks me (an Approve card to
continue) instead of refusing or quietly running up the bill."; SAFE-8.a:
"One Approve and its code let only the paused call through, at the amount
shown; the next call past the cap raises a new card and code."; Leif's go on
#318 adopted #334's REQ-agent-098 wording: "the run waits for the owner's
spend Approve card"). When `createSpendGuard` is given `approval` while a
cap is set, the guard SHALL expose `flatCard` (`FlatSpendCard`);
`createTaskExecute`'s tool loop SHALL hand it to every offered tool call as
`PluginHandlerArgs.spendCard` (through `runPlugin`, REQ-plugins-398), and
`reserveFlatSpend({ …, tool, card, signal })` SHALL call it when the
reservation is refused at the total cap (REQ-agent-098):

- The card SHALL be the REQ-agent-198 spend card, raised and decided by the
  same rules, on the flat call's own ledger and its DB's approvals store:
  with no owner configured, no card and the plain `spendCapReachedAsk` at
  once; otherwise, inside the run's one-card-at-a-time turn, which it shares
  with the run's model calls, a re-fit (a call that fits now is `held` at
  once, with no card), then one request of kind `spend` and class `money`
  (Approve also needs the SAFE-19 one-time code) with title `Spend past a
  cap — asks first (SAFE-8) · from <surface>`, action `send one <tool> via
  <provider>` (`send one web-search via api.search.brave.com`, `send one
  gif-search via api.giphy.com`; `spendCardFields({ tool })`), target the
  tripped scope (`total`), amount the call's price (`~$X (this one call's
  estimate)`; `~$0.00` for a $0 call), and the same text, requester, waiter
  and lifetime as a model call's card (SAFE-18); the wait note `[operator]
  AUTONOMY-8: waiting for the owner's OK on an Approve card with the one-time
  code (one <tool> past a spend cap, SAFE-8.a; request <id>; …)` (no amounts)
  and the approval note SHALL be the run's Text events.
- Only an approval the run uses once (`consume`) while its abort signal is
  not set SHALL let the call through, and then only that call:
  `SpendLedger.reserveApproved` SHALL record exactly one row at the price the
  card showed (a call that would by then pass a cap the card did not show
  records nothing and is a no), `reserveFlatSpend` SHALL return `held` on
  that row, the tool sends its one request and `settle` records the outcome
  once. The next flat call past the cap SHALL raise a new card and code
  (SAFE-8.a).
- A deny, no answer before the card lapses, a late code (SAFE-20), the run's
  stop (its abort signal, also one that lands as the owner approves), an
  approval that no longer matches, or a card that could not be raised SHALL
  be a no: nothing is sent or recorded, `reserveFlatSpend` SHALL return
  `stopped` with `spendCapReachedAsk({ estimateMicroUsd, trips, card })`, the
  tool returns it in `spendAsk`, and the tool loop ends the attempt `blocked`
  with it and `SPEND_CAP_SUMMARY` (REQ-agent-098). The no SHALL be returned
  (`FlatSpendCardOutcome`), never thrown or left for the guard's `finish`.
- Where a model call gets no card, the flat call SHALL keep the plain ask of
  REQ-agent-098: no owner configured, a guard without `approval`
  (`withSpendCap`: no `flatCard`), a call outside a run (`corvidinho plugins
  run`: no `spendCard`), an invalid cap setting or an unavailable ledger.
- No amount or cap setting SHALL reach the model, a tool message, the
  `ToolResult` or a non-owner post (SAFE-14.a): an approved call's result is
  the tool's own, and a no's details ride only `spendAsk`.
- No schema version, table, config key or env var changes. COS briefings at
  a cap and delivery on daemon-only or CLI-only installs are not part of this
  requirement (the card is recorded and waits out its lifetime there, as
  REQ-agent-198 says).

Acceptance Criteria
- Owner configured, $0.9990 of a $1.00 cap spent: a `web-search`-priced `reserveFlatSpend` with the guard's `flatCard` raises one `spend` / `money` card with action `send one web-search via api.search.brave.com`, target `total` and amount `~$0.0050 (this one call's estimate)`, the model call's title, requester, project and task text; approved (and used) it is `held` with exactly one row at 5000, settled once; the wait line names the call with no `$` amount; no model call; `finish` leaves the result alone.
- After one approved search the next one past the cap raises a second card; denied, it is `stopped` and no second row is recorded (SAFE-8.a).
- Denied: `stopped`, no row, request `denied`; the ask (`spendScopes` `["total"]`) says the owner denied Approve card `<id>`, keeps `Stopped at cap: total.`, offers asking again and the operator action, with no reply note; `finish` untouched.
- No answer before the card lapses (`expired`, a later approval does not take), the run's stop (the wait ends at once), a stop that lands as the owner approves (approval left unused) and a run already stopped (no card): `stopped`, no row.
- No owner (the plain ask at once), a guard without `approval` (no `flatCard`), an invalid cap value and an unavailable ledger: today's ask, no card, no row.
- A model call's open card holds a search's card back until it is decided; then the search gets its own card.
- A $0 `gif-search` with the window already past the cap asks on a card with action `send one gif-search via api.giphy.com` and amount `~$0.00 (this one call's estimate)`.
- Through `createTaskExecute` with an owner and a cap: approved, the one search goes out and the run goes on; the tool message and the `ToolResult` carry no amount, cap setting or card; denied, no request, one model call, `SPEND_CAP_SUMMARY` and the `spend-cap` ask naming the card.
- These tests fail on main's sources (except the no-card case, which keeps main's behavior).

## Modified

### REQUIREMENT REQ-agent-098


The agent SHALL enforce an optional operator-set daily spend cap on provider
(LLM) calls (SAFE-8, as amended on #98: warn at 80%, ask at 100%) in
`src/agent/spend.ts`. The cap SHALL be read from
`CORVIDINHO_DAILY_SPEND_CAP_USD` as a plain USD amount over a rolling
24-hour window. When it is unset or blank, the capped fetch SHALL be the
provider fetch unchanged and the database SHALL NOT be opened, so behavior
is unchanged. When it is set, `createTaskExecute` SHALL send every
OpenAI-compatible call through the capped fetch, which SHALL price the call
from a per-model table (standard USD per 1M input/output tokens, exact model
id match), estimate it from the request size plus the model's worst-case
reply (REQ-agent-298, AUTONOMY-8.a; no `max_tokens` is sent),
and, in one IMMEDIATE transaction on the shared SQLite `spend_ledger` table,
reserve the estimate unless spend in the last 24 hours plus the estimate
would exceed the cap. After the reply, the reservation SHALL be settled to
the provider-reported token usage cost; it SHALL stay at the estimate when
usage is missing or the request failed at the network, and SHALL count zero
when the provider returned an HTTP error.

Tool calls with a flat price per call SHALL count toward the same total
cap (Leif, #318: a Brave `web-search` is about $0.005; a GIPHY `gif-search`
is free-tier and SHALL be recorded at a price of 0, a $0 row, which passes
the cap only when the window is already past it): `reserveFlatSpend({
env, provider, model, tool, costMicroUsd, card?, signal?, db?, now? })`
(async) SHALL be `off` (DB never opened) without a cap, and otherwise reserve
the price in the same IMMEDIATE ledger transaction before the call. When
spend plus the price would exceed the cap and the calling run's spend card
is given (`card`, REQ-agent-398), the run SHALL wait for the owner's spend
Approve card, and the call SHALL be `held` on the one row an approval lets
through. Otherwise — no card, a no on the card, an invalid cap value or an
unavailable ledger (those two never raise a card) — it SHALL be `stopped`
with the same `spend-cap` ask as below (the card's outcome named after a
no), and the call SHALL NOT be sent. `held`'s `settle` records `billed` as
the call's actual cost, `not-billed` (refused before connecting, or an HTTP
error reply) as 0, and `unknown` (network error, timeout, abort, unreadable
reply) at the estimate, once.
A plugin stopped this way SHALL return the ask in
`PluginHandlerResult.spendAsk` (never in `data` or `message`), and the tool
loop SHALL end the attempt on an offered tool's `spend-cap` ask exactly as
for a model call stopped at the cap: a `ToolResult` with success false and
`SPEND_CAP_SUMMARY`, then the summary `SPEND_CAP_SUMMARY` and the ask, with
no further model call. The 80% warning for such a row is noted by the next
model call's settle.

At 100%, a call whose estimate would exceed the cap SHALL NOT be sent.
Instead the attempt SHALL end with `ask: {reason: "spend-cap", question}`
whose question states the 24-hour spend, the call estimate and the cap,
names the operator action that continues (raise or unset the cap where
Corvidinho runs and restart, or wait for earlier spend to leave the window,
then ask again) and says a reply cannot lift the cap, without a yes/no
question; the attempt's summary SHALL be the generic `SPEND_CAP_SUMMARY`,
which is `SPEND_PAUSED_TEXT` "Work is paused for budget." (SAFE-14.a), with no
amounts, no cap and no env names (safe for a public reply such as a WATCH
comment), and `runTask` SHALL return state `blocked` (never `done`, verify
not run, no retry) through the AUTONOMY-1/2 ask path. A model with no known
price, a cap value that is not a plain USD amount (never echoed), or an
unavailable ledger SHALL end the attempt the same way (never counted as
free, fail closed). The runner SHALL NOT send a provider call past the cap.

At 80%, after a call settles, when 24-hour spend is at or above 80% of the
cap and the warning for that cap value is armed, the module SHALL record one
pending warning in the module-owned `spend_alerts` table
(`src/agent/spend-alerts.ts`) within one IMMEDIATE transaction (so
concurrent processes warn once between them), emit one `Text` event naming
the spend, the cap and the percent, report it through `onSpendWarning`, and
`TaskResult.spendWarning` SHALL carry the integer amounts. The warning SHALL
be armed once per crossing: it disarms when recorded and re-arms when a
settle or a later reservation sees spend under 70% of that cap value, 24
hours after the last warning, or for a new cap value. Recording SHALL be
separate from delivery: a recorded warning SHALL stay pending until a
surface that can reach the owner claims it (`src/agent/spend-outbox.ts`
`createSpendAlertOutbox`: `takeWarning` claims every pending warning of the
last 24 hours in one IMMEDIATE transaction and returns current spend against
the recorded cap; while spend is back under 80% of that cap it SHALL claim
nothing and leave the warning pending — the crossing stays disarmed, so no
second warning is recorded — for the first post that sees 80% or more;
`release` returns a claimed warning when the post failed; `claimCapPing`
allows one owner ping per cap episode, re-armed the same way, and returns a
claim whose `release` hands the ping back when the post that carried it
failed). The module SHALL also report spend against the cap for doctor and
the owner's Discord `/status` line (AUTONOMOUS-8), and SHALL provide the only
spend line anyone else sees (SAFE-14.a): `spendPaused(snapshot)` is true while
runs stop at the spend check (24-hour spend at or past the cap, an unpriced
model, an invalid cap value, an unreadable ledger), and
`formatSpendPublicStatusLine(snapshot)` is "Spend: Work is paused for budget."
then and undefined otherwise, naming no amount, cap, model, path or setting.
The bridge delivers the claimed warning to the owner by DM only
(REQ-discord-098). The Approve card (#96, SAFE-18..20) and
per-provider caps (SAFE-14, and SAFE-15 for each cap) are not part of this
requirement; of SAFE-14 it covers only SAFE-14.a's public text.

Acceptance Criteria
- No cap: the capped fetch is the same fetch and no database file is created.
- Under the cap: the call is sent, the caller can still read the reply, and the ledger row settles to the usage cost in integer micro-USD.
- Spend plus estimate over the cap (including a zero cap): no fetch; the attempt returns a `spend-cap` ask naming spend, estimate, cap and `CORVIDINHO_DAILY_SPEND_CAP_USD`, ending with the operator action and no question mark; the summary is `SPEND_CAP_SUMMARY` (no `$`, no `CORVIDINHO_`); `runTask` returns `blocked` with verify skipped; `task run --json` exits 0 with `result.ask.reason` `spend-cap`.
- Spend older than 24 hours no longer counts.
- A flat-priced `web-search` (`tests/web.search.test.ts`): no cap opens no database; under the cap a `reserved` row of 5000 micro-USD exists when the request goes out and settles `actual` at 5000; an HTTP error or a refusal before connecting settles `failed` at 0, and a network failure, a body that fails mid-read, a timeout, a non-JSON or malformed 2xx body and an abort after the request went out stay `estimated` at 5000; a run already stopped reserves nothing and sends nothing; at the cap with no spend card to ask on (or with an invalid cap value, or an unavailable ledger such as a closed database, whose ask says the spend ledger is unavailable) nothing is sent, the error names no amount and the result carries the `spend-cap` ask; in the tool loop that search ends the attempt with `SPEND_CAP_SUMMARY` and the ask after one model call.
- A free `gif-search` (`tests/gif.search.test.ts`): no cap opens no database; under the cap a `reserved` row at 0 for `api.giphy.com` / `giphy-gif-search` exists when the request goes out and settles `actual` at 0, leaving 24-hour spend unchanged; a 2xx reply settles `actual` at 0 also when its body is an `error` or has no `results`; a 429 or a refusal before connecting settles `failed` at 0 and a network failure `estimated` at 0; a run already stopped writes no row; with the window already past the cap and no spend card to ask on, an invalid cap value, or an unavailable ledger, nothing is sent (and an invalid cap writes no row) and the result carries the `spend-cap` ask; in the tool loop that search ends the attempt with `SPEND_CAP_SUMMARY` and the ask after one model call.
- With the calling run's spend card a flat-priced call past the total cap waits on the owner's spend Approve card and is sent only on an approval, once (REQ-agent-398).
- Unpriced model, invalid cap value or unavailable ledger: no fetch and a `spend-cap` ask; the invalid value and secret-shaped model ids are not echoed.
- HTTP error reply counts 0; missing usage and network errors keep the estimate.
- Two connections on one DB file see each other's reservations and record the 80% warning once between them.
- The call that brings spend to 80% yields exactly one `Text` warning and one `onSpendWarning`; later calls stay quiet while spend stays at or above 70%; after spend is seen under 70% (by a settle or a reservation) the next crossing warns again, including within 24 hours; 24 hours after the last warning, or with a new cap value, it warns again; `task run --json` carries `result.spendWarning` on the crossing run.
- A warning recorded by one process is taken once by the outbox with current spend, can be released and taken again, and stays pending (not delivered, not dropped) while spend is back under 80%: 80% at T0, then 72%, then 96% delivers exactly one warning at 96% and records no second warning; without a database the outbox returns the run's own warning.
- `claimCapPing` returns a claim once per cap episode and again after spend is seen under 70% or 24 hours pass; a released claim lets the next claim in the same episode succeed.
- `SPEND_PAUSED_TEXT` is "Work is paused for budget." and `SPEND_CAP_SUMMARY` equals it; `formatSpendPublicStatusLine` is undefined with no cap and under the cap, and "Spend: Work is paused for budget." at the cap, for an unpriced model, an invalid value and an unreadable ledger; `spendPaused` flips exactly at the cap; the owner's `formatSpendStatusLine` keeps the amounts.
- The call estimate counts the model's worst-case reply (its listed maximum output, else 128000 tokens; REQ-agent-298), never a fixed 4096-token reserve, and the sent request carries no `max_tokens`.

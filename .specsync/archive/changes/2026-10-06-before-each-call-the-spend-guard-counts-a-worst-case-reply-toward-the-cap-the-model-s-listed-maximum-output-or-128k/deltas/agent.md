---
module: agent
change: before-each-call-the-spend-guard-counts-a-worst-case-reply-toward-the-cap-the-model-s-listed-maximum-output-or-128k
---

# Delta: agent (the spend guard counts a worst-case reply before each call — AUTONOMY-8.a)

## Added

### REQUIREMENT REQ-agent-298

Worst-case reply reserve (AUTONOMY-8.a, captured in this change from Leif's
2026-09-28 interview, round 16: "Before each call it counts a worst-case
reply toward the cap, so it asks before a long reply could take spend past
it; replies are never cut short."). While any spend cap is set
(REQ-agent-098, REQ-agent-114), the pre-call estimate of a priced provider
call (`estimateCallMicroUsd` in `src/agent/spend.ts`) SHALL be the
request's UTF-8 bytes / 3 as prompt tokens at the input price plus the
model's worst-case reply at the output price: `replyReserveTokens(price)`,
which SHALL be the model's listed maximum output
(`ModelPrice.maxOutputTokens` in `MODEL_PRICES_USD_PER_MTOK`, reasoning
tokens included) when that is a positive whole number, and otherwise
`REPLY_RESERVE_DEFAULT_TOKENS` (128000, the largest listed maximum). Every
priced model in the table SHALL list its maximum output. That estimate SHALL
be what the IMMEDIATE ledger transaction checks against every cap that
covers the call and reserves while the call is in flight, so a call whose
worst case would cross any cap SHALL ask first exactly as REQ-agent-098,
REQ-agent-114 and REQ-agent-198 describe (the owner's spend card at that
amount when an owner is configured and the run passes `approval`, otherwise
the `spend-cap` ask), and a call whose worst case fits SHALL be sent with no
ask. The guard SHALL NOT add `max_tokens` (or `max_completion_tokens`) to
the request and the runner SHALL NOT send one, so a reply is never cut
short. After the reply the reservation SHALL be settled as before
(REQ-agent-098: the provider-reported usage, else kept at the estimate, 0 on
an HTTP error). Unpriced models are unchanged (REQ-agent-199: no estimate,
the unknown-price card under a covering cap, unrecorded when no cap covers
them), and so are flat-priced tool calls (`reserveFlatSpend`). No env var,
config key, schema, NDJSON field or card text change.

Acceptance Criteria
- Every entry of `MODEL_PRICES_USD_PER_MTOK` lists `maxOutputTokens` above 4096 (gpt-4o 16384, claude-opus-5-5 128000, claude-haiku-4-5 64000) and `replyReserveTokens` returns it; a priced model with none (or with 0, a negative number, a fraction or NaN) counts `REPLY_RESERVE_DEFAULT_TOKENS` (128000).
- `estimateCallMicroUsd` for gpt-4o and 3000 request bytes is 1000 × 2.5 + 16384 × 10 micro-USD.
- A $0.10 total cap with nothing spent and a gpt-4o call: with no owner there is no fetch, no ledger row and a `spend-cap` ask naming the worst-case estimate; with an owner the call raises one `spend` / `money` card whose amount is that estimate, Approve sends exactly the built body once and the row settles `actual` at the reported usage, and Deny sends and records nothing.
- A $0.10 provider cap on the call's provider stops the same call with the SAFE-15 ask naming `provider:<id>`.
- A $1 cap with an owner configured: the gpt-4o call raises no card; while it is in flight its `reserved` row holds the worst case; afterwards the row is `actual` at the usage cost.
- The sent body equals the built body and has no `max_tokens` or `max_completion_tokens`, also in a capped `createTaskExecute` run.
- Unpriced models under a cap still ask on the unknown-amount card (recorded `unknown`) or stop with the unpriced ask; with no cap covering them they run unrecorded.
- Fixture: `tests/agent.spend-reserve.test.ts` (fails on main's `src/agent/spend.ts` and `src/agent/index.ts`).

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
is free-tier and SHALL be recorded at a price of 0, a $0 row, stopped only
when the window is already past the cap): `reserveFlatSpend({
env, provider, model, costMicroUsd, db?, now? })` SHALL be `off` (DB never
opened) without a cap, and otherwise reserve the price in the same IMMEDIATE
ledger transaction before the call — `stopped` with the same `spend-cap`
ask as below when spend plus the price would exceed the cap, the cap value
is invalid or the ledger is unavailable (the call SHALL NOT be sent), else
`held`, whose `settle` records `billed` as the call's actual cost,
`not-billed` (refused before connecting, or an HTTP error reply) as 0, and
`unknown` (network error, timeout, abort, unreadable reply) at the estimate.
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
- A flat-priced `web-search` (`tests/web.search.test.ts`): no cap opens no database; under the cap a `reserved` row of 5000 micro-USD exists when the request goes out and settles `actual` at 5000; an HTTP error or a refusal before connecting settles `failed` at 0, and a network failure, a body that fails mid-read, a timeout, a non-JSON or malformed 2xx body and an abort after the request went out stay `estimated` at 5000; a run already stopped reserves nothing and sends nothing; at the cap (or with an invalid cap value, or an unavailable ledger such as a closed database, whose ask says the spend ledger is unavailable) nothing is sent, the error names no amount and the result carries the `spend-cap` ask; in the tool loop that search ends the attempt with `SPEND_CAP_SUMMARY` and the ask after one model call.
- A free `gif-search` (`tests/gif.search.test.ts`): no cap opens no database; under the cap a `reserved` row at 0 for `api.giphy.com` / `giphy-gif-search` exists when the request goes out and settles `actual` at 0, leaving 24-hour spend unchanged; a 2xx reply settles `actual` at 0 also when its body is an `error` or has no `results`; a 429 or a refusal before connecting settles `failed` at 0 and a network failure `estimated` at 0; a run already stopped writes no row; with the window already past the cap, an invalid cap value, or an unavailable ledger, nothing is sent (and an invalid cap writes no row) and the result carries the `spend-cap` ask; in the tool loop that search ends the attempt with `SPEND_CAP_SUMMARY` and the ask after one model call.
- Unpriced model, invalid cap value or unavailable ledger: no fetch and a `spend-cap` ask; the invalid value and secret-shaped model ids are not echoed.
- HTTP error reply counts 0; missing usage and network errors keep the estimate.
- Two connections on one DB file see each other's reservations and record the 80% warning once between them.
- The call that brings spend to 80% yields exactly one `Text` warning and one `onSpendWarning`; later calls stay quiet while spend stays at or above 70%; after spend is seen under 70% (by a settle or a reservation) the next crossing warns again, including within 24 hours; 24 hours after the last warning, or with a new cap value, it warns again; `task run --json` carries `result.spendWarning` on the crossing run.
- A warning recorded by one process is taken once by the outbox with current spend, can be released and taken again, and stays pending (not delivered, not dropped) while spend is back under 80%: 80% at T0, then 72%, then 96% delivers exactly one warning at 96% and records no second warning; without a database the outbox returns the run's own warning.
- `claimCapPing` returns a claim once per cap episode and again after spend is seen under 70% or 24 hours pass; a released claim lets the next claim in the same episode succeed.
- `SPEND_PAUSED_TEXT` is "Work is paused for budget." and `SPEND_CAP_SUMMARY` equals it; `formatSpendPublicStatusLine` is undefined with no cap and under the cap, and "Spend: Work is paused for budget." at the cap, for an unpriced model, an invalid value and an unreadable ledger; `spendPaused` flips exactly at the cap; the owner's `formatSpendStatusLine` keeps the amounts.
- The call estimate counts the model's worst-case reply (its listed maximum output, else 128000 tokens; REQ-agent-298), never a fixed 4096-token reserve, and the sent request carries no `max_tokens`.

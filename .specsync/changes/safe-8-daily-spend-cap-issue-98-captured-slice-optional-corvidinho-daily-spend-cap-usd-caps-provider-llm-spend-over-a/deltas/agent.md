---
module: agent
change: safe-8-daily-spend-cap-issue-98-captured-slice-optional-corvidinho-daily-spend-cap-usd-caps-provider-llm-spend-over-a
---

# Delta — agent (daily spend cap, issue #98; text as amended by SAFE-8 on #98)

This change first added the requirement below with SAFE-8's earlier
wording (refuse at the cap). Leif amended SAFE-8 on #98 (warn at 80%, ask
at 100%) before this change was finalized, and the in-PR follow-up change
`safe-8-amended-issue-98-warn-at-80-of-the-daily-spend-cap-and-ask-at-100-instead-of-refusing-once-per-crossing-a-run` carries that amendment. The requirement here holds the amended
text so both changes verify against the same living tree.

## Added

### REQUIREMENT REQ-agent-098

The agent SHALL enforce an optional operator-set daily spend cap on provider
(LLM) calls (SAFE-8, as amended on #98: warn at 80%, ask at 100%) in
`src/agent/spend.ts`. The cap SHALL be read from
`CORVIDINHO_DAILY_SPEND_CAP_USD` as a plain USD amount over a rolling 24-hour
window. When it is unset or blank, the capped fetch SHALL be the provider
fetch unchanged and the database SHALL NOT be opened, so behavior is
unchanged. When it is set, `createTaskExecute` SHALL send every
OpenAI-compatible call through the capped fetch, which SHALL price the call
from a per-model table (standard USD per 1M input/output tokens, exact model
id match), estimate it from the request size plus a fixed reply reserve, and,
in one IMMEDIATE transaction on the shared SQLite `spend_ledger` table,
reserve the estimate unless spend in the last 24 hours plus the estimate
would exceed the cap. After the reply, the reservation SHALL be settled to
the provider-reported token usage cost; it SHALL stay at the estimate when
usage is missing or the request failed at the network, and SHALL count zero
when the provider returned an HTTP error.

At 100%, a call whose estimate would exceed the cap SHALL NOT be sent.
Instead the attempt SHALL end with `ask: {reason: "spend-cap", question}`
whose question states the 24-hour spend, the call estimate and the cap, names
the operator action that continues (raise or unset the cap where Corvidinho
runs and restart, or wait for earlier spend to leave the window, then ask
again) and says a reply cannot lift the cap, without a yes/no question; the
attempt's summary SHALL be the generic `SPEND_CAP_SUMMARY` with no amounts
and no env names (safe for a public reply such as a WATCH comment), and
`runTask` SHALL return state `blocked` (never `done`, verify not run, no
retry) through the AUTONOMY-1/2 ask path. A model with no known price, a cap
value that is not a plain USD amount (never echoed), or an unavailable ledger
SHALL end the attempt the same way (never counted as free, fail closed). The
runner SHALL NOT send a provider call past the cap.

At 80%, after a call settles, when 24-hour spend is at or above 80% of the
cap and the warning for that cap value is armed, the module SHALL record one
pending warning in the module-owned `spend_alerts` table
(`src/agent/spend-alerts.ts`) within one IMMEDIATE transaction (so concurrent
processes warn once between them), emit one `Text` event naming the spend,
the cap and the percent, report it through `onSpendWarning`, and
`TaskResult.spendWarning` SHALL carry the integer amounts. The warning SHALL
be armed once per crossing: it disarms when recorded and re-arms when a
settle or a later reservation sees spend under 70% of that cap value, 24
hours after the last warning, or for a new cap value. Recording SHALL be
separate from delivery: a recorded warning SHALL stay pending until a surface
that can reach the owner claims it (`src/agent/spend-outbox.ts`
`createSpendAlertOutbox`: `takeWarning` claims every pending warning of the
last 24 hours in one IMMEDIATE transaction, returns current spend against the
recorded cap, drops it when spend is back under 80%, and `release` returns
it when the post failed; `claimCapPing` allows one owner ping per cap episode,
re-armed the same way). The module SHALL also report spend against the cap
for doctor and Discord `/status` (AUTONOMOUS-8). The Approve card (#96, draft
SAFE-18..20) and draft SAFE-14..16 are not part of this requirement.

Acceptance Criteria
- No cap: the capped fetch is the same fetch and no database file is created.
- Under the cap: the call is sent, the caller can still read the reply, and the ledger row settles to the usage cost in integer micro-USD.
- Spend plus estimate over the cap (including a zero cap): no fetch; the attempt returns a `spend-cap` ask naming spend, estimate, cap and `CORVIDINHO_DAILY_SPEND_CAP_USD`, ending with the operator action and no question mark; the summary is `SPEND_CAP_SUMMARY` (no `$`, no `CORVIDINHO_`); `runTask` returns `blocked` with verify skipped; `task run --json` exits 0 with `result.ask.reason` `spend-cap`.
- Spend older than 24 hours no longer counts.
- Unpriced model, invalid cap value or unavailable ledger: no fetch and a `spend-cap` ask; the invalid value and secret-shaped model ids are not echoed.
- HTTP error reply counts 0; missing usage and network errors keep the estimate.
- Two connections on one DB file see each other's reservations and record the 80% warning once between them.
- The call that brings spend to 80% yields exactly one `Text` warning and one `onSpendWarning`; later calls stay quiet while spend stays at or above 70%; after spend is seen under 70% (by a settle or a reservation) the next crossing warns again, including within 24 hours; 24 hours after the last warning, or with a new cap value, it warns again; `task run --json` carries `result.spendWarning` on the crossing run.
- A warning recorded by one process is taken once by the outbox with current spend, can be released and taken again, and is dropped when spend is back under 80%; without a database the outbox returns the run's own warning.
- `claimCapPing` is true once per cap episode and true again after spend is seen under 70% or 24 hours pass.

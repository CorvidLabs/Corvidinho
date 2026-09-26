---
module: agent
change: safe-8-daily-spend-cap-issue-98-captured-slice-optional-corvidinho-daily-spend-cap-usd-caps-provider-llm-spend-over-a
---

# Delta — agent (SAFE-8 daily spend cap, issue #98)

## Added

### REQUIREMENT REQ-agent-098

The agent SHALL enforce an optional operator-set daily spend cap on provider
(LLM) calls (SAFE-8) in `src/agent/spend.ts`. The cap SHALL be read from
`CORVIDINHO_DAILY_SPEND_CAP_USD` as a plain USD amount over a rolling 24-hour
window. When it is unset or blank, `withSpendCap` SHALL return the provider
fetch unchanged and SHALL NOT open the database, so behavior is unchanged.
When it is set, `createTaskExecute` SHALL send every OpenAI-compatible call
through the capped fetch, which SHALL price the call from a per-model table
(standard USD per 1M input/output tokens, exact model id match), estimate it
from the request size plus a fixed reply reserve, and, in one IMMEDIATE
transaction on the shared SQLite `spend_ledger` table, refuse the call when
spend in the last 24 hours plus the estimate would exceed the cap or else
reserve the estimate. A refused call SHALL NOT be sent and SHALL fail with a
clear message naming the spend, the estimate, the cap and the variable, which
the task reports as its summary. After the reply, the reservation SHALL be
settled to the provider-reported token usage cost; it SHALL stay at the
estimate when usage is missing or the request failed at the network, and
SHALL count zero when the provider returned an HTTP error. A model with no
known price, or a cap value that is not a plain USD amount, SHALL cause every
provider call to be refused while the variable is set (never counted as free,
fail closed). The module SHALL also report spend against the cap for doctor
(AUTONOMOUS-8). Draft SAFE-14..16 (per-provider caps, 80 % warning, ask at
100 %, unknown spend shown as unknown) are not part of this requirement.

Acceptance Criteria
- No cap: `withSpendCap` returns the same fetch and no database file is created.
- Under the cap: the call is sent, the caller can still read the reply, and the ledger row settles to the usage cost in integer micro-USD.
- Spend plus estimate over the cap (including a zero cap): the call is refused before fetch with a message naming spend, estimate, cap and `CORVIDINHO_DAILY_SPEND_CAP_USD`.
- Spend older than 24 hours no longer counts.
- Unpriced model or invalid cap value: every call is refused; the invalid value is not echoed.
- HTTP error reply counts 0; missing usage and network errors keep the estimate.
- Two connections on one DB file see each other's reservations.
- `createTaskExecute` with a cap of 0 never calls fetch and its summary names the refusal.

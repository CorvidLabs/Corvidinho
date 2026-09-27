---
change: safe-8-daily-spend-cap-issue-98-captured-slice-optional-corvidinho-daily-spend-cap-usd-caps-provider-llm-spend-over-a
artifact: testing
---

# Testing

- `tests/agent.spend.test.ts`:
  - `parseSpendCap`: unset/blank off; plain amounts to micro-USD; `abc`, `-1`,
    `$5`, `1e3`, `Infinity`, `5 USD`, `1,5` invalid.
  - Pricing: exact ids, case-insensitive; dated / unknown / prototype ids
    unpriced; integer micro-USD cost rounded up; total-only usage at the output
    rate; estimate formula; `formatUsd`.
  - `withSpendCap`: no cap returns the same fetch and creates no DB file;
    under the cap the call goes through, the caller still reads the body, and
    the ledger row settles to actual usage cost; over the cap refuses before
    sending; spend older than 24 h does not count; zero cap refuses; unpriced
    model refused without touching the ledger; invalid cap refused without
    echoing the value; HTTP error counts 0, missing usage and network error
    keep the estimate; two DB connections on one file see each other's
    reservations.
  - SAFE-6: provider/model persist scrubbed; `SCRUB_TARGETS` lists them;
    `rescrubDatabase` re-scrubs raw rows.
  - `createTaskExecute`: a run with cap 0 never calls fetch and the summary
    names the refusal; a run under the cap records spend that
    `spendDoctorCheck` reports.
  - `spendDoctorCheck`: null when off; warn for invalid cap / unpriced model;
    estimated calls shown.
  - Real `bun src/cli.ts doctor`: no spend line without a cap; `[ok] spend:`
    line with one.
- No network, no real keys, no worktrees.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-098` | `tests/agent.spend.test.ts` | Cap parsing, pricing, reserve/refuse/settle, 24 h window, unpriced/invalid refusal, shared-file reservation, createTaskExecute hook. |
| `REQ-cli-098` | `tests/agent.spend.test.ts` | Real `doctor` prints the spend line only with a cap; `spendDoctorCheck` warn cases. |
| `REQ-discord-098` | `tests/agent.spend.test.ts` | Ledger provider/model scrubbed on write, listed in `SCRUB_TARGETS`, re-scrubbed by `rescrubDatabase`. |

## Automated coverage

- `bunx tsc --noEmit`
- `bun test`
- `specsync check --require-coverage 100`
- `fledge lanes run verify --non-interactive`

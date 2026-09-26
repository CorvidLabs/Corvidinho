---
module: cli
change: safe-8-daily-spend-cap-issue-98-captured-slice-optional-corvidinho-daily-spend-cap-usd-caps-provider-llm-spend-over-a
---

# Delta — cli (doctor spend line, issue #98)

## Added

### REQUIREMENT REQ-cli-098

When `CORVIDINHO_DAILY_SPEND_CAP_USD` is set, `corvidinho doctor` SHALL print
a `spend` line showing spend in the last 24 hours against the daily cap, the
number of provider calls counted, and how many are still counted at their
estimate (AUTONOMOUS-8 / SAFE-8). The line SHALL be marked `warn` when the cap
value is not a plain USD amount or the configured model has no known price
(both refuse every provider call), SHALL be informational, and SHALL NOT
change the doctor exit code. Without a cap, doctor output SHALL NOT include a
spend line. `--help` and `.env.example` SHALL list the variable.

Acceptance Criteria
- `bun src/cli.ts doctor` without the variable prints no spend line.
- With `CORVIDINHO_DAILY_SPEND_CAP_USD=5` it prints `[ok] spend: $0.00 of $5.00 daily cap used in the last 24h (0 provider call(s)`.
- Invalid cap and unpriced model yield a `warn` line with `ok: true`.

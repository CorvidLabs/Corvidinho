---
module: cli
change: safe-8-daily-spend-cap-issue-98-captured-slice-optional-corvidinho-daily-spend-cap-usd-caps-provider-llm-spend-over-a
---

# Delta — cli (doctor spend line, issue #98; text as amended by SAFE-8 on #98)

This change first added the requirement below with SAFE-8's earlier
wording (refuse at the cap). Leif amended SAFE-8 on #98 (warn at 80%, ask
at 100%) before this change was finalized, and the in-PR follow-up change
`safe-8-amended-issue-98-warn-at-80-of-the-daily-spend-cap-and-ask-at-100-instead-of-refusing-once-per-crossing-a-run` carries that amendment. The requirement here holds the amended
text so both changes verify against the same living tree.

## Added

### REQUIREMENT REQ-cli-098

`corvidinho doctor` SHALL always print a `spend` line (AUTONOMOUS-8 /
SAFE-8). Without `CORVIDINHO_DAILY_SPEND_CAP_USD` it SHALL be `info` and say
no daily cap is set, without opening the database. With the variable set it
SHALL show spend in the last 24 hours against the daily cap with the percent,
the number of provider calls counted, and how many are still counted at their
estimate, and SHALL be marked `warn` at or past the 80% warning, at the cap,
when the cap value is not a plain USD amount, when the configured model has
no known price, or when the ledger cannot be read (the last three stop and
ask before every provider call). The line SHALL be informational and SHALL
NOT change the doctor exit code. `task run` SHALL copy the run's 80% spend
warning onto `TaskResult.spendWarning` in `--json` output and the NDJSON
`result` frame, and a run stopped at the cap SHALL exit 0 with state
`blocked`; in text output it SHALL print the generic summary and the ask
question. `corvidinho daemon`, which has no Discord, SHALL log a `warn`
`spend.warning` line for a schedule run that crossed 80% and a `warn`
`run.needs_human` line with the ask reason for a run that stopped to ask,
leaving the recorded warning pending for a bridge to deliver. `--help` and
`.env.example` SHALL list the variable and say it warns at 80% and stops and
asks at 100%.

Acceptance Criteria
- `bun src/cli.ts doctor` without the variable prints `[info] spend: no daily cap set (CORVIDINHO_DAILY_SPEND_CAP_USD)`.
- With `CORVIDINHO_DAILY_SPEND_CAP_USD=5` it prints `[ok] spend: $0.00 of $5.00 daily cap used in the last 24h (0%; 0 provider call(s)`.
- Invalid cap, unpriced model, 80% and cap reached yield a `warn` line with `ok: true`.
- `task run --json` against a localhost mock LLM carries `result.spendWarning` on the crossing run only, and at the cap returns `blocked` with a `spend-cap` ask, the generic summary and exit 0 without calling the mock; `--output text` at the cap prints the summary and the ask question.
- The daemon logs `spend.warning` (amounts and percent) and `run.needs_human` (`reason` `spend-cap`) as `warn` lines for a schedule run that reports them.

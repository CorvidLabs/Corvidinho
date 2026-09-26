---
change: safe-8-daily-spend-cap-issue-98-captured-slice-optional-corvidinho-daily-spend-cap-usd-caps-provider-llm-spend-over-a
artifact: docs
---

# Docs

Ops: set `CORVIDINHO_DAILY_SPEND_CAP_USD=5` (USD per rolling 24 h) in the bot
VM env / the bridge's `.env` and restart the bridge; spawned agents inherit it.
Calls that would break the cap are refused with a message naming spend,
estimate and cap. `corvidinho doctor` prints
`[ok] spend: $x of $5.00 daily cap used in the last 24h ...` (or `[warn]` for
an invalid cap or an unpriced model). Unset the variable to turn the cap off.
Documented in `.env.example` and `--help`.

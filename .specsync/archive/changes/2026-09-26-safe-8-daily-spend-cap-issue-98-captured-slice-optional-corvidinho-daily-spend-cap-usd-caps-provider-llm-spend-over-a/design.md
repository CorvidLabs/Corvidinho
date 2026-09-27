---
change: safe-8-daily-spend-cap-issue-98-captured-slice-optional-corvidinho-daily-spend-cap-usd-caps-provider-llm-spend-over-a
artifact: design
---

# Design

## New module `src/agent/spend.ts` (agent spec)

- Knob: `CORVIDINHO_DAILY_SPEND_CAP_USD` (env). No existing config fits: the
  provider is configured only through env (`CORVIDINHO_LLM_*`), the cap is
  per box/operator rather than per project (fledge.toml `[corvidinho]` is per
  project), and bridge-spawned agents inherit the bridge env. Unset/blank =
  off; a plain USD amount (`5`, `2.50`, `.5`) = cap; anything else = invalid,
  so every provider call is refused (fail closed; the value is never echoed).
- "Daily" = rolling 24 h (`SPEND_WINDOW_MS`), no midnight reset burst.
- Price table `MODEL_PRICES_USD_PER_MTOK`: standard USD per 1M input/output
  tokens for common OpenAI and Anthropic (OpenAI-compatible endpoint) models,
  exact id match (trimmed, lower-cased). Cached-input discounts are ignored
  (errs high). Money is integer micro-USD (USD/MTok x 1000 = nano-USD per
  token, cost rounded up to micro-USD), so there is no float drift.
- Unpriced model while a cap is set: refused. Counting it as free would defeat
  the cap; guessing a ceiling price would report made-up spend. Remedy is a
  priced model or no cap. (Draft SAFE-16 covers showing unknown spend.)
- `SpendLedger` over table `spend_ledger` (id, ts, provider, model, status,
  estimate_micro_usd, cost_micro_usd, prompt/completion tokens, settled_at;
  index on ts). `reserve` checks window spend + estimate against the cap and
  inserts a `reserved` row inside one IMMEDIATE transaction, so concurrent
  bridge-spawned processes cannot both squeeze under the cap. `settle`:
  `actual` (provider usage cost), `estimated` (usage missing or unreadable, or
  network error / abort, which may have been billed), `failed` (HTTP error
  reply, cost 0). A crashed process leaves its reservation counted.
- Estimate before the call: UTF-8 request bytes / 3 prompt tokens + 4096 reply
  tokens at the model's prices. A reply longer than the reserve can overshoot
  the cap by that one call; the next call is refused.
- Usage reporting only `total_tokens` counts the unsplit remainder at the
  output (higher) rate.
- `withSpendCap(fetch, { env, readUsage })` returns `fetch` itself when off;
  otherwise a wrapper that refuses by throwing `SpendCapRefusal` before any
  request is sent, reads usage from a clone of the reply, and settles.
- `spendDoctorCheck({ env, model })`: null when off; else
  `{ ok: true, mark, detail }` with spend vs cap, calls, calls counted at their
  estimate, and a warn mark for an invalid cap or an unpriced configured
  model. Informational: never fails doctor (the box update script rolls back
  on a failing doctor).

## Hooks

- `src/agent/execute.ts`: `createTaskExecute` wraps its fetch with
  `withSpendCap(opts.fetchImpl ?? fetch, { env, readUsage: extractUsage })`.
  The refusal surfaces through the existing `LLM request failed: ...` path as
  the task summary (Discord/WATCH post it).
- `src/cli.ts`: doctor pushes the spend line when present; help lists the env.
- `src/store/scrub.ts`: `SCRUB_TARGETS` gains `spend_ledger` provider/model.
- `src/agent/index.ts`: re-exports.

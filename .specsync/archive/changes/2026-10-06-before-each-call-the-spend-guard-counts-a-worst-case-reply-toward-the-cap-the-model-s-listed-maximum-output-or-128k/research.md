---
change: before-each-call-the-spend-guard-counts-a-worst-case-reply-toward-the-cap-the-model-s-listed-maximum-output-or-128k
artifact: research
---

# Research

- Sources: issue #98 (body and four comments, incl. the v0.0.36 rollup), the
  interview record `/home/user/coord/interview-2026-09-28.md` round 16, and
  `src/agent/spend.ts` (`REPLY_RESERVE_TOKENS = 4096`,
  `estimateCallMicroUsd`, the guarded fetch, `reserveApproved`).
- No code in the repo knows a model's maximum output: there is no provider
  metadata for it and the AGENT-13 model list has no such field. The only
  per-model data is the spend guard's own price table
  (`MODEL_PRICES_USD_PER_MTOK`), already the source of truth for which models
  are priced (exact id match). Only priced calls get an estimate (unpriced
  calls have no amount at all, SAFE-16.a), so the table is the one place a
  worst-case figure is needed. No optional AGENT-13 field is needed.
- Listed maximum output per model: OpenAI gpt-4o / gpt-4o-mini 16,384;
  gpt-4.1 / -mini / -nano 32,768; gpt-5 / -mini / -nano 128,000; o3 and
  o4-mini 100,000 (reasoning tokens included). Anthropic (Claude API models
  table): Fable 5.1 / Fable 5 / Opus 5.5 / Opus 5 / Opus 4.8 / 4.7 / 4.6 /
  Sonnet 5 / Sonnet 4.6 128K (128,000), Haiku 4.5 64K (64,000).
- No request sends `max_tokens` or `max_completion_tokens` today
  (`grep -rn max_tokens src/` is empty), so without a cut the model's own
  maximum is the longest reply a call can bill.
- `reserveApproved` binds an approval to the estimate the card showed, so the
  card's amount already equals the (now larger) estimate; no card change.

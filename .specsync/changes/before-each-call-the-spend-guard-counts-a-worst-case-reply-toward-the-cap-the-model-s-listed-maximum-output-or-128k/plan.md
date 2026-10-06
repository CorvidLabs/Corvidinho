---
change: before-each-call-the-spend-guard-counts-a-worst-case-reply-toward-the-cap-the-model-s-listed-maximum-output-or-128k
artifact: plan
---

# Plan

1. `hi AUTONOMY-8.a "<confirmed text>"`; `hi check`; commit alone.
2. `src/agent/spend.ts`: `ModelPrice.maxOutputTokens`, the figures in
   `MODEL_PRICES_USD_PER_MTOK`, `REPLY_RESERVE_DEFAULT_TOKENS`,
   `replyReserveTokens`, `estimateCallMicroUsd`; header assumptions.
   `src/agent/index.ts` re-exports.
3. `tests/agent.spend-reserve.test.ts`; `tests/agent.spend.test.ts` follows
   the new estimate and table shape.
4. Fail-on-base proof: swap main's `src/agent/spend.ts` and
   `src/agent/index.ts` in, run the new file, restore, run again.
5. Docs (`docs/discord.md`, `docs/DISCORD-GO-LIVE.md`), spec prose
   (`specs/agent/agent.spec.md`), delta, module testing evidence.
6. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.

---
change: ask-option-ids-come-out-unique-so-choose-buttons-open-and-a-pick-resumes-with-the-pressed-label-a-reply-after-a-button
artifact: plan
---

# Plan

1. Regression tests: unit cases in `tests/discord.ask-buttons.test.ts` and
   bridge cases in `tests/discord.ask-ephemeral.test.ts` (fail on the base).
2. `normalizeAskOptions`: unique ids via `claimOptionId`.
3. `onMessage`: clear an expired button ask before the thin-ack/cancel gate.
4. Docs (`docs/discord.md`), spec prose and testing notes; deltas modify
   REQ-agent-045 and REQ-discord-044.
5. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.

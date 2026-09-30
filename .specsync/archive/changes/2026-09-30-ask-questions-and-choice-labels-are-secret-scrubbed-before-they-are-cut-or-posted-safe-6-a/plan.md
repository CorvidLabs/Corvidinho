---
change: ask-questions-and-choice-labels-are-secret-scrubbed-before-they-are-cut-or-posted-safe-6-a
artifact: plan
---

# Plan

1. Capture SAFE-6.a with `hi` (own commit); `hi check`.
2. Write the regression tests (unit: question and label straddling their
   cuts; posted: Choose-pick buttons, Answer stub/form, restated ask after a
   restart; stored: `pending_ask`, `schedule_runs.ask_question`).
3. Scrub before cut in `normalizeQuestion`, `cleanAskLabel`,
   `buildChoiceComponents`.
4. Swap main's three sources in: the new tests fail; restore: all pass.
5. Spec prose, testing evidence, `docs/discord.md`; deltas modify
   REQ-discord-066 and REQ-agent-045.
6. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.

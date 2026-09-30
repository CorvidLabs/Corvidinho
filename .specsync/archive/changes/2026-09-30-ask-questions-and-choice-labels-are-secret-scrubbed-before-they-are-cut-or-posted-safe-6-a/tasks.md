---
change: ask-questions-and-choice-labels-are-secret-scrubbed-before-they-are-cut-or-posted-safe-6-a
artifact: tasks
---

# Tasks

- [x] Capture SAFE-6.a with `hi` from Leif's 2026-09-28 interview (round 12); `hi check` passes.
- [x] `normalizeQuestion` scrubs before the `ASK_QUESTION_MAX` cut (`src/agent/ask.ts`).
- [x] `cleanAskLabel` scrubs before the 80 cut for every option (`src/agent/ask-options.ts`); option ids unchanged.
- [x] `buildChoiceComponents` posts `cleanAskLabel(label)` (`src/discord/ask-buttons.ts`).
- [x] Review fix: a cut question or label is scrubbed once more, so a cut that ends an AWS key id shape is redacted and normalizing again changes nothing (REQ-agent-045).
- [x] Regression tests: `tests/agent.ask.test.ts`, `tests/discord.ask-buttons.test.ts`, new `tests/discord.ask-scrub-first.test.ts`, `tests/scheduler.ask-outbox.test.ts`.
- [x] Fail-on-main proof: main's three sources swapped in → 10 of 67 fail (the 10 new tests); restored → 67 pass.
- [x] Deltas modify REQ-discord-066 and REQ-agent-045; spec prose, scenario, testing evidence, `docs/discord.md`.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.

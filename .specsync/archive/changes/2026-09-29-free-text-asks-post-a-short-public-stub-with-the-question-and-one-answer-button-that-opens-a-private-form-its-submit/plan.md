---
change: free-text-asks-post-a-short-public-stub-with-the-question-and-one-answer-button-that-opens-a-private-form-its-submit
artifact: plan
---

# Plan

1. Helpers in `ask-buttons.ts` / `ask-ping.ts` (Answer button, modal, custom
   id, answer normalization, hint).
2. Gateway: `showModal`, `modalValues`, `adaptModalSubmit`, MODAL_SUBMIT
   routing to `onComponent`.
3. Bridge: Answer button on free-text posts and restatements; modal open on
   the requester's press; submit through the shared gates and the pick's
   resume code with the reply's prompt block; late free-text press keeps the
   ask; `keepFooter`.
4. Slash `/work` and `/session start` free-text answers get the button.
5. Tests: new bridge-harness file; four existing tests updated to the Answer
   button/hint. Prove they fail on the base source (swap in, run, restore).
6. Docs + spec body + testing.md + delta (REQ-discord-548 Added).
7. `specsync change approve` → `change check --commit` → `change audit` →
   `specsync check --require-coverage 100` → `hi check` → `bunx tsc --noEmit`
   → `bun test` → `fledge lanes run verify --non-interactive`.

---
change: open-discord-asks-are-secret-scrubbed-before-the-session-row-is-saved-and-the-safe-6-re-scrub-rewrites-stored-open-asks
artifact: plan
---

# Plan

1. Re-check the gap on main (probe: raw token in `pending_ask`, re-scrub
   leaves it).
2. `session-store.ts`: scrub question, option labels and option ids in
   `pendingAskBody`; `ask-options.ts`: a secret-looking option id falls back
   to its position.
3. `scrub.ts`: `scrubJsonText`; `SCRUB_TARGETS` `json` columns; JSON-aware
   pass, `jsonUnparsed` count and content-free log line in
   `rescrubDatabase`; `SCRUB_RULES_VERSION` 3.
4. Regression tests in `tests/store.scrub.test.ts` (fail on main, pass on the
   branch).
5. Docs and spec prose; REQ-discord-066 delta (Modified).
6. `specsync check --require-coverage 100`, `bunx tsc --noEmit`,
   `bun test`, `fledge lanes run verify --non-interactive`.

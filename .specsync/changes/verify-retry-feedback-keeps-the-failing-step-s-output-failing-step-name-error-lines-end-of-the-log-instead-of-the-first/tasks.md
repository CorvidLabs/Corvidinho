---
change: verify-retry-feedback-keeps-the-failing-step-s-output-failing-step-name-error-lines-end-of-the-log-instead-of-the-first
artifact: tasks
---

# Tasks

- [x] Reproduce on main: a scratch fledge lane shaped like Corvidinho's (lint, the real `--help` smoke, a failing bun test) gives a 5178-char log whose first 4000 chars hold no error line.
- [x] Regression tests fail on main: with origin/main's src/agent/verify.ts, loop.ts and execute.ts swapped in, 3 tests in tests/agent.loop.test.ts and tests/agent.tool-loop.test.ts fail and tests/agent.verify-feedback.test.ts cannot load (no `verifyFeedbackExcerpt`).
- [x] `verifyFeedbackExcerpt` and `VERIFY_FEEDBACK_MAX_CHARS` in src/agent/verify.ts.
- [x] `runTask` builds the retry feedback with the excerpt within the cap; the tool loop and the read-tier chat cap with it instead of `slice(0, 4000)`.
- [x] Guard tests pass on main and branch: short verify output reaches the retry whole (loop and read-tier chat).
- [x] Delta (agent, Modified REQ-agent-002), spec prose (Public API, Invariants, Error Cases, files), testing.md.
- [x] Full suite, typecheck, SpecSync and the verify lane green.
- [x] Review: error lines that report a failure are kept before log lines that only mention one (Corvidinho's bun test stdout chatter crowded the failure out); colour escapes dropped over the cap; parallel steps named whole; no-marker header no longer claims a failing step. Tests fail on d43ac3e's verify.ts.

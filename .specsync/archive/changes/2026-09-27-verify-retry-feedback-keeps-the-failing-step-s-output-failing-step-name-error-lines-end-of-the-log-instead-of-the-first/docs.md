---
change: verify-retry-feedback-keeps-the-failing-step-s-output-failing-step-name-error-lines-end-of-the-log-instead-of-the-first
artifact: docs
---

# Docs

- `specs/agent/agent.spec.md`: `tests/agent.verify-feedback.test.ts` and
  `tests/fixtures/verify-lane-log.ts` in `files:`; a Public API paragraph
  (`VERIFY_FEEDBACK_MAX_CHARS`, `verifyFeedbackExcerpt`), an Invariants
  paragraph and an Error Cases row.
- `specs/agent/testing.md`: "Verify retry feedback (REQ-agent-002,
  AGENT-4.a)".
- Delta: agent, Modified REQ-agent-002 (the retry's verifier output is the
  failing step's, not a head cut).
- No README, docs/, CHANGELOG, STATUS or package version change: no operator
  surface changes (no flag, env var or config key), and no doc said the
  model gets the first 4000 chars.

---
change: verify-retry-feedback-keeps-the-failing-step-s-output-failing-step-name-error-lines-end-of-the-log-instead-of-the-first
artifact: requirements
---

# Requirements

HI: AGENT-4.a ("If verification fails and retries remain, it keeps working
with the failure output instead of shrugging"), under AGENT-4.

- REQ-agent-002 (modified): "Fail with retries remaining → re-enter executing
  with verifier output" now says which output: the failing step's. Output
  within `VERIFY_FEEDBACK_MAX_CHARS` (4000) is passed whole; over it the
  feedback names the failing step and keeps its output, or its error lines
  and the end of the log, never the start of the log; at most 4000 chars,
  never half a surrogate pair. `runTask` keeps its feedback within the cap
  and the LLM execute (tool loop and read-tier chat) caps with the same
  excerpt, not a head cut. New acceptance criteria for each.

Unchanged: REQ-agent-003 (skip path), REQ-agent-085 (real-diff gate),
REQ-agent-242 (union, provider error), REQ-agent-244 (abort).

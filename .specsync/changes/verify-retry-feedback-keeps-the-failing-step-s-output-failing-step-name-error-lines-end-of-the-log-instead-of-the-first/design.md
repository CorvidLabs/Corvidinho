---
change: verify-retry-feedback-keeps-the-failing-step-s-output-failing-step-name-error-lines-end-of-the-log-instead-of-the-first
artifact: design
---

# Design

- **`verifyFeedbackExcerpt(output, max = VERIFY_FEEDBACK_MAX_CHARS)`** in
  src/agent/verify.ts (next to the runner whose output format it reads).
  Output within `max` is returned unchanged. Over it:
  1. The failing step comes from the last fledge `Lane '<lane>' failed at
     step N (<name>)` line; the section starts at the last `Running task:
     <name>` marker for it (else the last marker, else the start). Steps run
     in order and stderr follows stdout, so the section holds the failing
     step's stdout and the lane's stderr.
  2. A header line says the log was over the cap and this is the failing
     step's output, then `Failing step: <name> (step N of lane '<lane>')`.
  3. If the section fits, it is kept whole.
  4. Else: error / fail lines from the section before the tail (regex
     `error|fail|panic|exception|expected|received|✗✘✖`, lines starting
     `(pass)`, `(skip)`, `(todo)`, `✓` or `✔` left out, deduped, each at most
     300 chars, first ones first) get up to half the room, and the end of
     the log gets the rest (at least half), starting at a line start when one
     is within 200 chars. No error lines: header plus the end of the log.
  5. Never longer than `max`, never cut inside a surrogate pair; a `max` too
     small for the header gives just the end of the log.
- **`runTask`** builds `verifyFeedback` as the fixed "Verification failed.
  Fix these errors and try again:" head plus the excerpt at `max - head`, so
  the whole feedback is within 4000 chars and keeps its head.
- **LLM execute** (tool loop and read-tier chat) replaces
  `verifyFeedback.slice(0, 4000)` with `verifyFeedbackExcerpt(verifyFeedback)`:
  a no-op for `runTask`'s feedback, and a caller that passes a raw long log
  gets the failing step instead of the head.
- **Unchanged:** the runner (argv, env, process group, stdout then stderr),
  `VerifyResult.output`, the `VerifyResult` event / NDJSON frame, the
  exhausted-retries summary and the provider-error summary (human facing, full
  output), CLI's 500-char operator echo of the feedback.
- **Chosen conservatively (pending Leif):** the cap stays 4000 chars (no new
  config key); the excerpt relies on fledge's own markers and falls back to
  the end of the log for any other runner; short output is sent whole as
  today.

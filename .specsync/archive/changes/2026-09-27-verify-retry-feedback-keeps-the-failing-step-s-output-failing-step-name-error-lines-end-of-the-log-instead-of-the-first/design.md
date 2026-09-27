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
     `error|fail|panic|fatal|exception|expected|received|✗✘✖`, lines
     starting `(pass)`, `(skip)`, `(todo)`, `✓` or `✔` left out, deduped,
     each at most 300 chars) get up to half the room, and the end of the log
     gets the rest (at least half), starting at a line start when one is
     within 200 chars. Lines that report a failure (starting `(fail)`, `✗`,
     `error`, `TypeError`, `Expected`, `Received`, `failed`, `panic`, `fatal`,
     or `: error` / `: fatal` after a location, as tsc prints) take the room
     first, then lines that only mention one; each group first ones first;
     kept lines print in log order. Corvidinho's own `bun test` prints about
     41 KB of test console output on stdout (after the `test` marker, before
     bun's stderr report), some of it "… marked failed" / "error_class=ok":
     without the ranking that chatter filled the room and the failure fell
     out (review finding). No error lines: header plus the end of the log.
  5. Never longer than `max`, never cut inside a surrogate pair; a `max` too
     small for the header gives just the end of the log.
  6. Colour escapes (CSI) are dropped first when the output is over the cap
     (FORCE_COLOR / CLICOLOR_FORCE reaching the lane), so the markers and
     `(pass)` lines still match; a `parallel(a, b)` step matches its
     `Running parallel: a, b` line. With no fledge line and no marker, the
     header says only that the start is left out.
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

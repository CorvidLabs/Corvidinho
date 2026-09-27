---
id: verify-retry-feedback-keeps-the-failing-step-s-output-failing-step-name-error-lines-end-of-the-log-instead-of-the-first
state: implementing
type: bug_fix
base_commit: fbaa84b7cda1bf2b462baea44cad20ef93e0df4f
---

# Verify retry feedback keeps the failing step's output (failing step name, error lines, end of the log) instead of the first 4000 chars of the lane log (AGENT-4.a, #85)

## Intent

Verify retry feedback keeps the failing step's output (failing step name, error lines, end of the log) instead of the first 4000 chars of the lane log (AGENT-4.a, #85)

## Affected Canonical Specs

- `agent`

## Acceptance Criteria

- After a failed verify with retries left, the retry's verifyFeedback and the model's user message (tool loop and read-tier chat) keep the failing step's output instead of the first 4000 chars of the lane log: a lane log over the cap (fledge log is stdout then stderr, so passing steps such as the --help smoke fill the head) yields at most 4000 chars naming the failing step (from fledge's Lane '<lane>' failed at step N (<name>) line), carrying that step's output from its Running task marker when it fits, else its error/fail lines (first ones first, passing-test lines excluded) plus the end of the log with fledge's failure line; output within the cap is sent unchanged as today; never over 4000 chars, never half a surrogate pair; no new flag, env var, config key, slash command, schema or package version change; the human-facing summary and NDJSON frames are unchanged; regression tests fail on main and pass on the branch

## No-spec Rationale

Not applicable

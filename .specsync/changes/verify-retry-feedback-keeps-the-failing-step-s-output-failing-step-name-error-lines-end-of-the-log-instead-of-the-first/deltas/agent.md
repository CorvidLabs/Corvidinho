---
module: agent
change: verify-retry-feedback-keeps-the-failing-step-s-output-failing-step-name-error-lines-end-of-the-log-instead-of-the-first
---

# Delta — agent (verify retry feedback keeps the failing step's output)

## Modified

### REQUIREMENT REQ-agent-002

When `verify_before_complete` is enabled and the run changed files (reported by a tool, or in the run's real git working-tree diff per REQ-agent-085), completion SHALL run `fledge lanes run verify --non-interactive`. Pass → `verified=true`. Fail with retries remaining → re-enter executing with verifier output. Exhausted retries → terminal failure with `verified=false` (AGENT-4 / AGENT-4.a / FLEDGE-2). The default runner SHALL spawn fledge with the parent's env minus the delegate worker drop list (`DISCORD_*`, `GITHUB_TOKEN`, `GH_TOKEN`, `CORVIDINHO_AUDIT_HMAC_KEY` and every `CORVIDINHO_ACTING_*` key) and the LLM API keys (`CORVIDINHO_LLM_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`), keeping every other inherited key, so tests the agent wrote never see operator secrets (SAFE-6). The verifier output a retry gets SHALL be the failing step's, not the start of the lane log (AGENT-4.a): output within `VERIFY_FEEDBACK_MAX_CHARS` (4000) is passed whole; over it, `verifyFeedbackExcerpt` SHALL name the failing step (from fledge's `Lane '<lane>' failed at step N (<name>)` line) and keep that step's output from its `Running task: <name>` marker when it fits, else its error / fail lines (first ones first, passing-test lines left out) and the end of the log, in at most 4000 chars and never cut inside a surrogate pair. `runTask` SHALL keep the feedback it passes as `ExecuteContext.verifyFeedback` (its "Verification failed" head included) within that cap, and the LLM execute (tool loop and read-tier chat) SHALL cap verify feedback with the same excerpt, never by keeping its first 4000 chars. No flag, environment variable or config key is added.

Acceptance Criteria
- Mock verify fail then pass within max_retries yields `verified=true` and a second execute call that receives feedback.
- Exhausted retries yield `verified=false` and failed state.
- Default runner invokes fledge with `lanes run verify --non-interactive`.
- An attempt whose execute result reports no files but that changed the git working tree (REQ-agent-085) runs verify: done with `verified=true` only on a pass, otherwise retried and then failed.
- A process with `DISCORD_TOKEN`, `DISCORD_BOT_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `CORVIDINHO_LLM_API_KEY`, `CORVIDINHO_AUDIT_HMAC_KEY` and `CORVIDINHO_ACTING_*` set runs the default runner: the fledge child's env has none of those keys or values and keeps the rest (PATH, HOME, `CORVIDINHO_DATA_DIR`, other keys).
- A failing lane log whose passing steps (lint, a `--help` smoke over 4000 chars) come before a failing `test` step gives the retry's `verifyFeedback` and the tool loop's next request at most 4000 chars that name `Failing step: test (step 3 of lane 'verify')` and carry the failing test's error lines and fledge's failure line, not the `--help` text (AGENT-4.a).
- A failing step whose own output is over the cap keeps its first error lines and the end of the log (the last failure, the test summary, fledge's failure line); passing-test lines are not kept as error lines.
- A raw verify feedback over the cap passed to the read-tier chat is cut to the failing step and the end of the log, not its first 4000 chars.
- Verify output within the cap reaches the retry and the model whole, as before.
- The excerpt is never longer than its cap and never holds half a surrogate pair.

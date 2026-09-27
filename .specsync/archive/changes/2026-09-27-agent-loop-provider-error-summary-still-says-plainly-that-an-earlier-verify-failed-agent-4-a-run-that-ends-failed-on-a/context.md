---
change: agent-loop-provider-error-summary-still-says-plainly-that-an-earlier-verify-failed-agent-4-a-run-that-ends-failed-on-a
artifact: context
---

# Context

Adversarial review of PR #199 (bug agent-loop-2). The PR makes a provider /
HTTP failure end the run `failed` (REQ-agent-242), which is correct, but in
its headline scenario the result no longer says that verification failed:
attempt 1 writes `app.ts`, verify fails, attempt 2 gets HTTP 503, and the
run ends `failed` with only `LLM HTTP 503: upstream overloaded` as the
summary. The failing file stays on disk and nothing in the summary tells the
human (or a delegating lead reading the worker summary) that it failed
verification. The stuck path already appends the verify output to the
summary; the provider-error path dropped it.

AGENT-4 (`hi/agent.md`): it does not say done until verify passed, or it
tells me plainly that verification failed. State and exit code were already
right; this change is about the summary text only.

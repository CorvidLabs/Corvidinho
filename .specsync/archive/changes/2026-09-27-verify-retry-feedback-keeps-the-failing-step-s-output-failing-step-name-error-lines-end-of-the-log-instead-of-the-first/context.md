---
change: verify-retry-feedback-keeps-the-failing-step-s-output-failing-step-name-error-lines-end-of-the-log-instead-of-the-first
artifact: context
---

# Context

HI: AGENT-4.a (hi/agent.md) — "If verification fails and retries remain, it
keeps working with the failure output instead of shrugging." Parent AGENT-4,
issue #85 (lists AGENT-4.a as captured).

Gap on main (fbaa84b): `defaultVerifyRunner` returns
`${stdout}${stderr}` (src/agent/verify.ts), `runTask` passes the whole of it
as `verifyFeedback` (src/agent/loop.ts), and the LLM execute sends
`verifyFeedback.slice(0, 4000)` to the model in both the tool loop and the
read-tier chat (src/agent/execute.ts). Corvidinho's own verify lane runs
`lint` and `smoke` (`bun src/cli.ts --help`, about 4400 chars on stdout)
before `test`, and bun test writes its failures to stderr, so the first 4000
chars are the fledge lane header plus the `--help` text. A failing test
never reached the model on a retry: it retried blind.

Reproduced with a scratch fledge lane of the same shape (fledge 1.8.0, bun
1.4.2): a failing `test` step after the real `--help` smoke gave a 5178-char
log whose first 4000 chars held no `error:` line, no `(fail)` line and no
`Lane 'verify' failed at step 3 (test)` line.

Constraints: no new flag, env var, config key or slash command; no SQLite
schema or package version change; the human-facing summary, the NDJSON
`VerifyResult` frame and the verify argv / env are unchanged.

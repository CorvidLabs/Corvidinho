---
module: watch
change: a-failed-delegate-worker-or-council-voice-hands-its-lead-one-plain-failure-line-the-worker-s-result-error-without-the
---

# Delta: watch (the public line's host-free helper is shared with the delegate core)

## Modified

### REQUIREMENT REQ-watch-009

The system SHALL post a short agent summary comment on the same GitHub thread when the agent run finishes (success or failure), after a successful auto-ack on issue_comment or issues start_session or continue_session, at most once per event id, with Made with Corvidinho attribution (WATCH-RELIABILITY-1).

A failed run without an ask of its own (a non-zero exit, or a spawn that
threw) SHALL say why in one plain line and SHALL NOT post its run summary,
which for a model failure is `LLM HTTP <status>: <provider body>` — the
provider's reply (account or org names, request ids, quota details), which
must never reach a public thread. Under `Corvidinho WATCH run summary —
Failed (exit N).` the comment SHALL carry `watchFailureReason(spawn, env)`
(`src/watch/summary.ts`), the same reason the Discord surfaces give
(`failureReasonFor`, `src/discord/failure-reason.ts`, REQ-discord-032):
the `task run` result's `error` (which model call failed and how —
`The model call failed (<status> <name> from <host>)`, never the provider's
reply body; the no-provider notice; which verify failed), which the WATCH
spawn client hands over as `AgentSpawnResult.failureReason`; else the
no-provider notice for the run's tier in the watcher's env; else the last
meaningful line of the run's stderr (`AgentSpawnResult.stderrTail`); else the exit code. A thrown
spawn's message stands in for the result's `error`. The line is SAFE-6
scrubbed first, stack frames and host paths are dropped, and it is at most
200 characters. On the thread a model-call line SHALL NOT name the
provider's host: `watchPublicFailureLine(reason)` (`src/watch/summary.ts`;
it is the shared `withoutProviderHost` from `src/agent/providers.ts`, which a
failed delegate worker's line for its lead uses too, REQ-agent-117) turns `The model call failed (<status> <name> from <host>)` into `The model
call failed (<status> <name>)`, and likewise drops the host of a timeout
(`The model call timed out`), a network error (`… (network error)`), a
malformed reply (`… (malformed reply)`), a call with no failure detail and a
host the 200-character cap cut; any other reason (the no-key line, the
no-provider notice, a stderr line, the exit-code line) is shown as it is. A
host can be the account's own resource name (`<resource>.openai.azure.com`),
a private gateway or an Ollama server's address; on Discord only the owner
sees it (REQ-discord-032), and this thread is public. The SAFE-13 owner line
and the footer follow as before. The poller SHALL log `[watch] run failed
(<owner/repo>#<n> id=<event id>, exit N): <reason>` with the host (no `, exit
N` for a spawn that threw) and keep the comment's line (no host) as the run's
agent turn in the thread's conversation (REQ-watch-472), so a later run never
replays a provider body or host to the model. The operator-only
spawn-outcome JSONL keeps the scrubbed run summary as `summaryPreview`
(REQ-watch-010, REQ-watch-231). A successful run's comment, a failed run that
stopped on an ask of its own (its summary carries `Needs your input: …`,
REQ-watch-086) and a spend-cap stop ("Work is paused for budget.",
SAFE-14.a, REQ-watch-099) are unchanged. No env var, config key or
GitHub-visible surface is added.

Acceptance Criteria
- Summary skipped when auto-ack did not succeed or event already summarized.
- Summary posted for both ok and non-zero exit runs.
- Fixture tests need no live GitHub token.
- Through `startWatchPoller` and the real `task run` against a localhost model that answers 429 with an org name and a request id, the summary comment is exactly `Corvidinho WATCH run summary — Failed (exit 1).`, `The model call failed (429 Too Many Requests)` and the footer; no comment has the host (`127.0.0.1:<port>`), and no comment or log line has the org name, the request id or `LLM HTTP`; the log has `[watch] run failed (CorvidLabs/Corvidinho#42 id=…, exit 1): The model call failed (429 Too Many Requests from 127.0.0.1:<port>)`; the thread's agent turn is the comment's line (no host); the spawn log's `summaryPreview` starts `LLM HTTP 429: `.
- `watchPublicFailureLine` over `modelCallFailedLine` for a host of `acme-prod.openai.azure.com:8443` gives `The model call failed (429 Too Many Requests)`, `(599)`, `The model call timed out`, `(network error)`, `(malformed reply)` and `The model call failed` (no failure detail), and drops a host the 200-character cap cut; the no-key line, the no-provider notice, a verify line, a stderr line and the exit-code lines come back unchanged.
- With no result `error` (and a model configured) a failed run's comment is its scrubbed stderr end (host paths cut, a token `[redacted:…]`), else `The run failed (exit N) without saying why`; a thrown spawn's comment and log line are its scrubbed one-line message with no exit code.
- A successful run's comment is unchanged; a failed run with a stuck ask keeps its summary with `Needs your input: …`; a spend-cap stop keeps "Work is paused for budget.".
- `tests/watch.failed-comment.test.ts` fails on main's `src/watch` sources and passes on the branch; its host cases also fail with the host kept on the thread.
- `watchPublicFailureLine` is `withoutProviderHost` for every `modelCallFailedLine` shape (`tests/autonomous.worker-failure.test.ts`); `tests/watch.failed-comment.test.ts` passes unchanged.

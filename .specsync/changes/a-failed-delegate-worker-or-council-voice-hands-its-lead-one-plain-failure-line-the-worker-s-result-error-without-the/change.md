---
id: a-failed-delegate-worker-or-council-voice-hands-its-lead-one-plain-failure-line-the-worker-s-result-error-without-the
state: verifying
type: bug_fix
base_commit: cf7f61b2d624fd9b26f4b21f74fd691185f4284d
---

# A failed delegate worker or council voice hands its lead one plain failure line (the worker's result error without the provider's host, the no-provider notice, or the exit code), never the worker's summary or stderr, which for a model failure is the provider's raw error body

## Intent

A failed delegate worker or council voice hands its lead one plain failure line (the worker's result error without the provider's host, the no-provider notice, or the exit code), never the worker's summary or stderr, which for a model failure is the provider's raw error body

## Affected Canonical Specs

- `agent`
- `watch`

## Acceptance Criteria

- Through a lead tool loop and the real task run against the localhost fake provider answering 429 with an org name, a request id and its own host, a failed delegate worker's tool message to the lead model has data.summary 'The model call failed (429 Too Many Requests)' and error 'worker (tier code, depth 1) did not finish (state failed, exit 1):' plus that line, with no org name, request id, provider host, 'LLM HTTP' or provider message; a council whose voice 3 gets that 429 keeps that same line as the voice's transcript entry, the other voices' entries and the chair's decision are their own replies, and no result or later-phase prompt holds the provider detail. workerFailureLine gives the timeout / interrupt line, else the worker's result error as one scrubbed plain line without the provider's host (withoutProviderHost, the helper watchPublicFailureLine now is), else the no-provider notice for the worker's tier, else 'the worker failed (exit N)', never the worker's summary, stdout or stderr. A successful worker, a worker that stopped on an ask of its own, the models and stopReason fields and the SAFE-12/13 fence of a worker that reported an injection are unchanged. The new tests fail on main's src/autonomous/delegate.ts and pass on the branch; WATCH's public line is unchanged.

## No-spec Rationale

Not applicable

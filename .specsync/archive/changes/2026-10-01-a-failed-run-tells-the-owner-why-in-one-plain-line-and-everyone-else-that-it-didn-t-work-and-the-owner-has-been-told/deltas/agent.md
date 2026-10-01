---
module: agent
change: a-failed-run-tells-the-owner-why-in-one-plain-line-and-everyone-else-that-it-didn-t-work-and-the-owner-has-been-told
---

# Delta: agent (a failed run's result names why in plain harness text — DISCORD-3.b)

## Added

### REQUIREMENT REQ-agent-032

A failed run's result SHALL name why in one plain line of harness text, so a
bridge can tell the owner (DISCORD-3.b, AGENT-9). `TaskResult` gains an
optional `error?: string` (additive; the NDJSON protocol version is
unchanged) and `ExecuteResult` an optional `failureReason?: string`. A
failed model call SHALL carry `modelCallFailedLine(failure, provider)`
(`src/agent/providers.ts`) of the chain's last failure: `The model call
failed (<status> <standard name> from <host>)`, `The model call timed out
(<host>)`, `… (network error reaching <host>)`, `… (malformed reply from
<host>)` or `… (<label> needs <KEY>, which is not set)` — built from the
failure kind, the status and the provider's host only, never the provider's
reply body or a key; an empty chain is `NO_PROVIDER_NOTICE`. An attempt
with no usable provider SHALL carry its no-provider notice (AGENT-10).
`runTask` SHALL copy the attempt's `failureReason` to the failed result's
`error`, and SHALL set `verifyGaveUpReason(maxRetries)` (`Verification
failed after N retries`) or `VERIFY_RERUN_FAILED_REASON` when verify fails
for good; never model or tool text. A spend-cap stop is blocked, not failed,
and carries none (SAFE-14.a). `collectTaskRunStream` SHALL return
`stderrTail`, the last `STDERR_TAIL_MAX` (4000) characters of the child's
stderr when it wrote any.

Acceptance Criteria
- `task run --output ndjson` against a provider that answers 401 exits 1 with a `failed` result whose `error` is `The model call failed (401 Unauthorized from <host>)` and holds no body text.
- With no model configured the result's `error` is the no-provider notice.
- Each `ModelFailure` kind maps to its line; verify give-up and re-run failures name themselves.
- A child that crashes with no result frame hands its stderr end back as `stderrTail`.

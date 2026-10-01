---
change: a-failed-delegate-worker-or-council-voice-hands-its-lead-one-plain-failure-line-the-worker-s-result-error-without-the
artifact: context
---

# Context

Found in the adversarial review of PR #343 (WATCH's failed-run comment, now
merged as b8b5e56): its research note left a model-mediated path open. A
failed `delegate` worker's summary is `LLM HTTP <status>: <provider body>`
(only secrets scrubbed), and `plugins/autonomous/commands.ts` handed it to
the lead model as the tool result — both `data.summary` and the `error`
text (`src/autonomous/delegate.ts` `runDelegateChild`). A failed council
voice's summary went into the council transcript the same way
(`src/autonomous/council.ts` quotes `out.summary` for a failed run). A lead
that still finished could quote it in its answer, so the provider's body
(org or account names, request ids, quota details, sometimes the provider's
host) could reach a public reply or a GitHub comment.

Prior art on main: #340 (DISCORD-3.b) gave the `task run` result an optional
`error` (`modelCallFailedLine`: status and host, never the body) and
`src/discord/failure-reason.ts` (`plainFailureLine`,
`failureReasonFromUnknown`); #343 added `watchPublicFailureLine`
(`src/watch/summary.ts`), which drops the host from a model-call line.

Constraints from the task: reuse or factor the host-free helper (no fork);
keep the worker's `models` (GITHUB-9, #341) and `stopReason` (AGENT-12,
#342) and the SAFE-12 fence of worker output; successful workers unchanged;
no new product surface, no hi capture.

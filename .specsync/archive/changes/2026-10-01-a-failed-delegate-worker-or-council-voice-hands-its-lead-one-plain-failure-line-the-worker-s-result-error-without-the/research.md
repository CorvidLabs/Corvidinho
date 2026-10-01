---
change: a-failed-delegate-worker-or-council-voice-hands-its-lead-one-plain-failure-line-the-worker-s-result-error-without-the
artifact: research
---

# Research

Where a failed worker's provider detail could reach the lead (main at
cf7f61b):

- `runDelegateChild` → `DelegateChildOutcome.summary` = scrubbed
  `collectTaskRunStream` summary: the result frame's chat body
  (`LLM HTTP <status>: <body>` for a model failure), else the
  stdout/stderr fallback (`chatBodyFromTaskRunOutput`) for a worker with no
  frame. Both reach the lead through the plugin's `data.summary` and
  `error`, and the lead's `ToolResult` event detail. Fixed here.
- `resultText` (the result's own summary): only quoted for a finished
  council voice; now unset for a failed worker so no later reader can pick it
  up.
- Council: `speak` quotes `out.summary` for a failed run; later phases only
  see finished entries, but the transcript goes to the lead. Fixed by the
  delegate core's line.
- Timeout / abort: the summary was `worker timed out and was stopped\n<raw>`
  (the raw part from stdout/stderr); now the line alone. The council still
  rewrites the interrupt line to `voice stopped: <why>`.
- Not changed: `worker failed to start: <spawn error>` (exit 127, harness
  text from `Bun.spawn`, no provider output); a worker that stopped on an
  ask (`Needs your input: …`: the ask's question, never a provider body);
  successful workers.
- The result `error` is harness text (`modelCallFailedLine`,
  `verifyGaveUpReason`, the idle-timeout line, the no-provider notice); its
  only provider detail is the host, which `withoutProviderHost` drops.

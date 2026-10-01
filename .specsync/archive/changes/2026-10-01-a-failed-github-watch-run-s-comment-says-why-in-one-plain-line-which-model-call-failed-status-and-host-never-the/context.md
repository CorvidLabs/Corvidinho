---
change: a-failed-github-watch-run-s-comment-says-why-in-one-plain-line-which-model-call-failed-status-and-host-never-the
artifact: context
---

# Context

Found in the review of #340 (DISCORD-3.b, merged as aeb2de3). #340 made every
Discord surface show a failed run's owner one plain, secret-scrubbed reason
(`src/discord/failure-reason.ts`, `modelCallFailedLine`: status and host,
never the provider's reply body) and added the `task run` result's optional
`error`. Its review found two leftovers:

1. A failed WATCH run's public GitHub summary comment still posted the run
   summary. For a model failure that is `LLM HTTP <status>: <provider body>`
   (`src/agent/execute.ts`): scrubbed of vendor keys, but the provider's raw
   reply — account or org names, request ids, quota details — on a public
   issue or PR. The same text was kept as the thread's agent turn and
   replayed to the model on the next event there, so a later answer could
   repeat it.
2. REQ-cli-079 still said a daemon no-provider schedule run's "channel post
   and run row keep the usual `failed (exit 1)` line". Since #340 the
   scheduler records the DISCORD-3.b line (`src/scheduler/service.ts`), and
   the daemon (`src/daemon/daemon.ts`) wires no owner DM and no outbound
   poster.

Constraints: no new product surface and no new `hi` criteria (the
behaviour follows WATCH-RELIABILITY-1, SAFE-6/12/14.a and #340's reason
source); successful runs, the stuck-ask DM (AGENT-16.a, #313) and the
spend-cap texts (SAFE-14.a) stay as they are; no env var, config key, schema
or protocol change.

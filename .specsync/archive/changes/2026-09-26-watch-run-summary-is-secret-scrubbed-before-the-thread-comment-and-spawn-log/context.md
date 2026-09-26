---
change: watch-run-summary-is-secret-scrubbed-before-the-thread-comment-and-spawn-log
artifact: context
---

# Context

A review of WATCH found that the post-run summary went out unscrubbed. When an
allowlisted @mention starts a run, `maybePostWatchSummary` posts up to 1200
chars of the agent summary as an issue comment, and that comment is public on
public repos. The poller also appends a 240-char `summaryPreview` to the
durable `watch-spawn.jsonl`. The summary is agent output: the result-frame
summary, the child's stderr when no result frame parses, or a thrown spawn
error message. The child inherits `GITHUB_TOKEN` through `...process.env`, so
a model that quotes env or shell output can put a token in it. Neither sink
called `scrubSecrets`. The scheduler does scrub the same kind of field before
persisting it (`schedule_runs.summary` via `scrubOpt`). This breaks SAFE-6 and
the AGENTS.md Secrets rule (secrets stay out of logs).

Constraints: bug fix only. No new env vars, commands or config. Reuse
`scrubSecrets` from `src/store/scrub.ts`, the same patterns as the DB scrub.

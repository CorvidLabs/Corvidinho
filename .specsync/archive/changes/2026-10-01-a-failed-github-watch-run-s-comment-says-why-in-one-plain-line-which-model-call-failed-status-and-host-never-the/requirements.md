---
change: a-failed-github-watch-run-s-comment-says-why-in-one-plain-line-which-model-call-failed-status-and-host-never-the
artifact: requirements
---

# Requirements

- WATCH-RELIABILITY-1 (a summary comment after every finished run, success or
  failure) is kept; a failed run's comment now says why in one plain line.
- SAFE-6 (scrub first), SAFE-12/13 (the line is harness text, never model,
  tool or provider output), SAFE-14.a (a spend-cap stop stays "Work is paused
  for budget."), AGENT-16.a (a stuck ask keeps `Needs your input: …` and its
  owner DM), AGENT-10 (the no-provider notice) are kept.
- The reason is DISCORD-3.b's (#340): `failureReasonFor` /
  `modelCallFailedLine` — no new reason source and no new criterion.
- Modified: REQ-watch-009 (the failed-run comment line, its log line, the
  JSONL choice), REQ-watch-472 (a failed run's kept agent turn is that line),
  REQ-watch-080 (the fallback note rides a run that still finished),
  REQ-cli-079 (what a daemon no-provider schedule run records now).
- No env var, config key, flag, table, schema or protocol version.

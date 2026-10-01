---
change: a-failed-run-tells-the-owner-why-in-one-plain-line-and-everyone-else-that-it-didn-t-work-and-the-owner-has-been-told
artifact: requirements
---

# Requirements

- DISCORD-3.b (captured in this PR with `hi`, Leif 2026-09-30, interview round
  15): "When a run fails, my own runs tell me why in one plain line; everyone
  else gets 'That didn't work — the owner has been told.', and the reason is
  always logged."
- Kept: DISCORD-3.a (plumbing in the embed footer, never the body), AGENT-9
  (no internal stop reasons, stack traces or raw stderr in the channel),
  AGENT-10 (the no-provider notice), SAFE-6 (scrub before cut), SAFE-14.a (no
  spend amounts to non-owners; a spend-cap stop is not a failure),
  SAFE-12/13 (the reason is harness text, never model or tool output),
  DISCORD-15.a (the owner check), DISCORD-SCHEDULE-1.a (a schedule the owner
  created is the owner's).
- Added: REQ-discord-032 (the failed-run reply, owner DM and log on every
  Discord surface), REQ-agent-032 (the result's plain `error`,
  `modelCallFailedLine`, the stderr tail).
- No new env var, config key, flag, slash command, NDJSON protocol version or
  schema version; the result frame's `error` is optional and additive.

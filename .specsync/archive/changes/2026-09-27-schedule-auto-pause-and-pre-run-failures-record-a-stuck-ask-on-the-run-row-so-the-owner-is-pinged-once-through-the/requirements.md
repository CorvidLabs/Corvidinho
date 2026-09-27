---
change: schedule-auto-pause-and-pre-run-failures-record-a-stuck-ask-on-the-run-row-so-the-owner-is-pinged-once-through-the
artifact: requirements
---

# Requirements

- Added REQ-discord-353 (delta `deltas/discord.md`): a run that cannot
  start (project resolve or worktree failure) records a stuck ask with a
  fixed, path-free question; the run whose failure makes 5 in a row records
  the stuck auto-pause ask (pause line + `/schedule resume`, plus its own
  question) in the same run-finish write, chosen by the SQL failure count;
  both go through the REQ-discord-347 in-process post and bridge delivery
  pass (owner pinged once per question); the pausing run's ask replaces its
  `❌` post (context: only its `failed (exit N)` line when it had no ask of
  its own); a pause ask whose in-process post does not go out is handed
  back for the next delivery pass (a paused schedule has no next run); a
  run that throws posts its pause ask at once; a resolve / worktree step
  that throws is a pre-run failure too; gate-refused runs still post
  nothing and their pause ask waits for the gate.
- REQ-discord-347, REQ-discord-020, REQ-discord-108 and REQ-cli-098 are
  unchanged: the new asks are ordinary stuck asks on the run row.
- HI: AUTONOMY-2 only (with AUTONOMY-4, DISCORD-SCHEDULE-3, SAFE-6 as they
  are). No acceptance criteria beyond the captured text.

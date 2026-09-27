---
change: schedule-auto-pause-and-pre-run-failures-record-a-stuck-ask-on-the-run-row-so-the-owner-is-pinged-once-through-the
artifact: context
---

# Context

Captured HI: **AUTONOMY-2** — "When stuck, it pings the configured owner on
Discord rather than dying silently." Issues #97, #104. Routing kept as is:
AUTONOMY-4 (stuck → owner), DISCORD-SCHEDULE-3 (creator + channel gate),
REQ-discord-418 (no host paths to non-owners), SAFE-6.

Gap on main (fbaa84b, after #238): `SchedulerService.maybeAutoPause` sets a
schedule `paused` after 5 failures in a row and posts nothing about it: the
bridge posts the pausing run's plain `❌ … failed (exit 1)` line with no
ping, and a daemon-claimed run posts nothing at all; the only consumer of
`onRunFinished.autoPaused` is the daemon's `run.finished` log line. The
`project resolve failed` and `worktree failed` branches of `runOne` call
`finish()` and return before any post, so a schedule whose project or
worktree is broken fails every tick, then pauses, without a word on Discord.

Constraints: reuse the REQ-discord-347 path (run-row ask, in-process post,
bridge delivery pass) — no new post path, no daemon posting (AUTONOMOUS-7
daemon-only box posting is an open Leif question). No schema bump, no new
slash command, env var or config key. The resolve / worktree errors carry
host paths, so the posted question must not include them.

Out of scope: a run that throws before recording (the `catch` in `runOne`)
still records no ask of its own (it counts toward the pause, whose ask is
posted); DISCORD-SCHEDULE-3 refusals stay silent by design; open PRs #232 and
#233 are untouched.

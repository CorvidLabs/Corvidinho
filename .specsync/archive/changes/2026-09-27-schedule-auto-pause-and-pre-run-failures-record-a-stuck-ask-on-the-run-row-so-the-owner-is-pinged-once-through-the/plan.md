---
change: schedule-auto-pause-and-pre-run-failures-record-a-stuck-ask-on-the-run-row-so-the-owner-is-pinged-once-through-the
artifact: plan
---

# Plan

1. Re-check the gap on current main (fbaa84b): still present.
2. Regression tests in `tests/scheduler.ask-outbox.test.ts` and
   `tests/scheduler.service.test.ts`; confirm they fail on main's scheduler
   sources.
3. Store: `markRunFinished` takes an optional `autoPause { at, ask }` and
   stores that ask when the SQL failure count reaches `at`.
4. Service: `PROJECT_RESOLVE_FAILED_QUESTION`, `WORKTREE_FAILED_QUESTION`,
   `autoPauseAsk`; `failBeforeRun` for the two pre-run branches;
   `finish()` returns the run's effective ask; `postOwnRunAsk` (the
   existing in-process gate + claim + post) used by both paths.
5. Docs (`docs/discord.md`, `docs/DAEMON.md`), spec paragraph, testing
   notes, delta (Added REQ-discord-353).
6. `specsync check --require-coverage 100`, `bunx tsc --noEmit`,
   `bun test`, `fledge lanes run verify --non-interactive`.

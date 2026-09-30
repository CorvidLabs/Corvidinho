---
change: a-non-owner-s-schedule-text-is-scanned-at-schedule-create-and-fenced-at-every-tick-a-non-owner-s-create-whose-name-or
artifact: docs
---

# Docs

- `docs/discord.md`: the `/schedule create` row of the slash table (a
  non-owner's injection is refused privately and the owner pinged); a new
  SAFE-13 sub-bullet under "Untrusted text and injection attempts" (create
  refusal, tick fence with the creator's role, tick refusal pauses and pings
  the owner once, the owner's schedules unchanged).
- `docs/DISCORD-GO-LIVE.md` E.6.a: a "Schedules" bullet.
- `specs/discord/discord.spec.md`: REQ-discord-713 paragraph (exports
  `scheduleInjection`, `injectedScheduleQuestion`, `schedule-prompt`, the
  two scheduler options), a scenario, two error-case rows,
  `tests/scheduler.injection.test.ts` in `files`; `specs/discord/testing.md`
  section. Requirements through the delta.
- README, STATUS and `docs/DAEMON.md` say nothing this makes false. No
  CHANGELOG / version edits.

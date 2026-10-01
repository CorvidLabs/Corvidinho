---
change: a-team-member-s-failed-session-or-work-reply-and-someone-else-s-failed-schedule-post-is-checked-for-the-reason-s-401
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-032` | `tests/discord.failed-reply.test.ts` "/session: the owner's run shows the reason; a team member's says the owner was told (DMed once)" and "/work: …" | Every `crypto.randomUUID` starts with `401` (`idsWith401`), so the team member's reply shows `sess_401…` (and `work_401…`); the reply with the run's own ids masked (`withoutRunIds`) contains no `401`, and the reply still contains `That didn't work — the owner has been told.` with one DM to the owner. With the old bare check and the pinned ids: 60 of 60 runs fail at that check (`--rerun-each 30`). With the new check: 1200 of 1200 pass pinned, and 1200 of 1200 pass with natural random ids where main failed 13 of 1200 (`--rerun-each 600`). |
| `REQ-discord-032` | `tests/discord.failed-reply.test.ts` "the owner's schedule posts the reason; someone else's says the owner was told (DMed), or only that it didn't work" | With the pinned ids someone else's post shows `sched_401…`; with the schedule id masked it contains no `401` and ends with the told line. Old bare check with the pinned ids: 30 of 30 fail; new check: 600 of 600 pass pinned and 600 of 600 with natural ids. |
| `REQ-discord-032` | the whole file and full `bun test` | All 22 tests of the file pass 30 of 30 runs (`--rerun-each 30`, 660 of 660); the spy is restored after each test. Full suite passes. |

---
change: a-team-member-s-failed-session-or-work-reply-and-someone-else-s-failed-schedule-post-is-checked-for-the-reason-s-401
artifact: tasks
---

# Tasks

- [x] Read the failed CI job's log: the one failing assertion is line 613 `not.toContain("401")`, with the `401` inside `sess_e096e6401b2c480a`.
- [x] Reproduce on main with `--rerun-each 600` on the `/session` and `/work` tests: 13 of 1200 fail, each on an id holding `401`.
- [x] Check the other bare `401` checks in the file: the schedule post shows `sched_` + 6 hex digits (same hazard); chat's content edits carry no ids.
- [x] `tests/discord.failed-reply.test.ts`: `withoutRunIds` masks the session, work-task and schedule ids and the worktree path before the `401` check; `idsWith401` makes every `crypto.randomUUID` in the `/session`, `/work` and schedule tests start with `401`, so the ids carry it every run.
- [x] Prove: the old check with the pinned ids fails 90 of 90; the new check passes 1800 of 1800 pinned and 1800 of 1800 with natural ids; full suite and verify green.

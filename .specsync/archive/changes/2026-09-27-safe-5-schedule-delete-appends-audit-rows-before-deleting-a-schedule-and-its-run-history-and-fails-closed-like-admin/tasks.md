---
change: safe-5-schedule-delete-appends-audit-rows-before-deleting-a-schedule-and-its-run-history-and-fails-closed-like-admin
artifact: tasks
---

# Tasks

- [x] Reproduce on main: no audit row for `/schedule delete`; the delete goes through with the trail throwing or unset.
- [x] Regression tests in `tests/discord.schedule.test.ts` that fail on main's `schedule.ts` (6 of the 7 new tests) and pass on the branch.
- [x] `handleDelete`: `started` before the delete (fail closed), `ok`/`error` after, row numbers in the reply; `denied` for a non-ADMIN delete.
- [x] Delta: Modified REQ-discord-020; `specs/discord/requirements.md`, `testing.md` and `discord.spec.md` updated.
- [x] Operator docs: `docs/discord.md`, `docs/DISCORD-GO-LIVE.md`.

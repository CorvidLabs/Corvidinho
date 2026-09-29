---
change: exact-event-run-tests-read-a-fixture-persona-so-an-uncommitted-persona-md-edit-never-breaks-bun-test-or-the-verify-lane
artifact: tasks
---

# Tasks

- [x] Reproduce: append a line to `persona.md` without committing; `bun test` had 5 failures in the three files above.
- [x] Add `tests/fixtures/persona/persona.md` (plain folder, fixture text, no secrets).
- [x] Pass `personaRoot: PERSONA_FIXTURE` in the exact-event `createTaskExecute` calls of the three test files.
- [x] Re-run with the dirty `persona.md`: the whole suite passes; restore the file; the suite passes again.

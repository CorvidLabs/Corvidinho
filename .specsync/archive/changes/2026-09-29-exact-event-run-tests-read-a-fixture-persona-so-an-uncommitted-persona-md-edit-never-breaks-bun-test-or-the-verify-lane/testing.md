---
change: exact-event-run-tests-read-a-fixture-persona-so-an-uncommitted-persona-md-edit-never-breaks-bun-test-or-the-verify-lane
artifact: testing
---

# Testing

| Check | Evidence |
|---|---|
| Dirty `persona.md` (one line appended, not committed) | Before: `bun test` 2120 pass / 5 fail (the five tests named in the context). After: the whole suite passes, 0 fail. |
| Clean checkout | `bun test` passes, 0 fail; `bunx tsc --noEmit` clean. |
| Unchanged behavior | The five tests keep their assertions; only their persona root moves to the fixture. The persona tests in `tests/agent.persona.test.ts` still cover the note for a working-tree edit (REQ-agent-069). |

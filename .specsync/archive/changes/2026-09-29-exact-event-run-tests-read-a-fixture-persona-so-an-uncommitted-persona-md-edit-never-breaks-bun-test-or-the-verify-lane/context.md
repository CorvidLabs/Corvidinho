---
change: exact-event-run-tests-read-a-fixture-persona-so-an-uncommitted-persona-md-edit-never-breaks-bun-test-or-the-verify-lane
artifact: context
---

# Context

Found in review of the persona PR (#69). PERSONA-2 makes `persona.md` the
one editable voice file, and `createTaskExecute` reads it from
Corvidinho's own checkout on every run. In a git checkout only the committed
copy loads, and a working-tree edit adds one "Persona: persona.md (committed
copy; working-tree changes not loaded)" `Text` note to every run
(REQ-agent-069).

The unit tests run `createTaskExecute` in process, so their persona root is
the checkout under test. With `persona.md` edited but not yet committed,
which is the normal way to change the voice and what an agent task that
edits it leaves behind when the verify lane runs, five unrelated tests that
assert a run's exact events failed on the extra note:

- `tests/agent.project-instructions.test.ts`: "a planted working-tree
  AGENTS.md never reaches the prompt; one note names it", "a refused or
  truncated file is reported once as a Text event", "no instruction files:
  no note and no block";
- `tests/agent.spend-ask.test.ts`: "the crossing call emits a Text warning
  and calls onSpendWarning; the next run is quiet";
- `tests/agent.events-ndjson.test.ts`: "tool loop reports running totals
  across rounds; events unchanged".

Those runs now pass `personaRoot` = `tests/fixtures/persona`, a plain
folder (no `.git`) holding a small fixture `persona.md`: a clean load,
so no note. Product code, the NDJSON protocol and REQ-agent-069 are
unchanged. The spawned end-to-end persona tests keep reading the shipped
file on purpose.

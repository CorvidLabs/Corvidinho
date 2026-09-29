# Lesson bundle — exact-event-run-tests-read-a-fixture-persona-so-an-uncommitted-persona-md-edit-never-breaks-bun-test-or-the-verify-lane

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Exact-event run tests read a fixture persona so an uncommitted persona.md edit never breaks bun test or the verify lane (PERSONA-2, #69)
- **Kind**: BugFix
- **Paths**: tests/agent.events-ndjson.test.ts, tests/agent.project-instructions.test.ts, tests/agent.spend-ask.test.ts, tests/fixtures/persona/persona.md
- **Acceptance**: With persona.md edited in the checkout but not committed (an extra line appended), the whole bun test suite passes: the project-instructions, spend-warning and NDJSON running-totals tests that assert a run's exact events pass personaRoot = tests/fixtures/persona (a plain folder with no .git, a clean load, no Persona note); no product code, spec requirement or event changes

## Evidence

- Verification commit: `e6d2cb2e0c47754a5a7a9384eeb3ab148064840e`
- Base commit: `25924db48661c72bda92c98c6ceb2ea182385b9e`
- Verified by: `specsync check --spec agent`

## From the change's context.md

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

## From the change's testing.md

# Testing

| Check | Evidence |
|---|---|
| Dirty `persona.md` (one line appended, not committed) | Before: `bun test` 2120 pass / 5 fail (the five tests named in the context). After: the whole suite passes, 0 fail. |
| Clean checkout | `bun test` passes, 0 fail; `bunx tsc --noEmit` clean. |
| Unchanged behavior | The five tests keep their assertions; only their persona root moves to the fixture. The persona tests in `tests/agent.persona.test.ts` still cover the note for a working-tree edit (REQ-agent-069). |

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.

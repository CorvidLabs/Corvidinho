---
id: exact-event-run-tests-read-a-fixture-persona-so-an-uncommitted-persona-md-edit-never-breaks-bun-test-or-the-verify-lane
state: approved
type: bug_fix
base_commit: 25924db48661c72bda92c98c6ceb2ea182385b9e
---

# Exact-event run tests read a fixture persona so an uncommitted persona.md edit never breaks bun test or the verify lane (PERSONA-2, #69)

## Intent

Exact-event run tests read a fixture persona so an uncommitted persona.md edit never breaks bun test or the verify lane (PERSONA-2, #69)

## Affected Canonical Specs

- None

## Acceptance Criteria

- With persona.md edited in the checkout but not committed (an extra line appended), the whole bun test suite passes: the project-instructions, spend-warning and NDJSON running-totals tests that assert a run's exact events pass personaRoot = tests/fixtures/persona (a plain folder with no .git, a clean load, no Persona note); no product code, spec requirement or event changes

## No-spec Rationale

Test isolation only: five tests that assert a run's exact events pass personaRoot = tests/fixtures/persona; product behavior and REQ-agent-069 are unchanged (the persona feature change in the same PR owns the agent spec)

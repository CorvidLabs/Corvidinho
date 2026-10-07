---
module: cli
change: named-personas-are-their-own-files-in-personas-with-name-model-and-skill-tags-the-owner-can-run-a-task-as-one-and-a
---

# Delta: cli (task run --persona; a worker takes its lead's pick — AUTONOMOUS-2, AUTONOMOUS-5.a)

## Added

### REQUIREMENT REQ-cli-225

`corvidinho task run` SHALL accept `--persona NAME` (or `--persona=NAME`)
from its own args before the first `--` (`parseTaskPersona`), listed in
`TASK_RUN_USAGE` and `--help`, to run the task as that named persona
(AUTONOMOUS-2 / AUTONOMOUS-5.a, REQ-agent-225): it SHALL pass
`persona: { name, by: "owner" }` to `createTaskExecute`, which refuses it in
a role session whose actor is not the owner, and fails the run with one plain
line for an unknown persona or an unconfigured model. `--persona` with no
name SHALL be a usage error (exit 1, `--persona needs a name`). Without the
flag, a delegate worker (delegation depth > 0) SHALL pass its lead's pick
from `CORVIDINHO_DELEGATE_PERSONA` as `by: "lead"`; a top-level run SHALL
never take a persona from env. Without either, the run is unchanged.

Acceptance Criteria
- `task run --here --persona <unknown> --output json` ends failed (exit 1) with the not-found line and calls no model (`tests/agent.personas.test.ts`).
- `--persona` with no value exits 1 with `--persona needs a name`.
- A community role session's `--persona` gets `PERSONA_OWNER_ONLY_LINE`.
- At depth 1 `CORVIDINHO_DELEGATE_PERSONA` reaches the run (not-found line); at depth 0 it is ignored.
- Fails on main's `src/cli.ts` and passes on the branch.

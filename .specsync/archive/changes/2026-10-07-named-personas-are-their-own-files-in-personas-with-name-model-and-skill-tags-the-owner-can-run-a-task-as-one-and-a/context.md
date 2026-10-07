---
change: named-personas-are-their-own-files-in-personas-with-name-model-and-skill-tags-the-owner-can-run-a-task-as-one-and-a
artifact: context
---

# Context

- Leif's 2026-09-28 interview, round 17 (2026-10-07; /home/user/coord/interview-2026-09-28.md):
  next big builds include named personas (AUTONOMOUS-2/5). Decisions: **extra persona
  files** — persona.md stays the default voice; each named persona is its own file
  (name, model, skill tags, voice) in a personas/ folder; **owner and lead runs** — the
  owner can run a task as a persona; a lead run (delegate/council) picks a persona by
  skill tag; team/community can't pick personas.
- Captured in this change's PR with `hi`: AUTONOMOUS-2.a and AUTONOMOUS-5.a
  (hi/autonomous.md). AUTONOMOUS-2, AUTONOMOUS-5 and PERSONA-2 are on main and stay true.
- Existing pieces reused: `persona.md` loader (`src/agent/persona.ts`, REQ-agent-069) on the
  AGENT-1 loader (`src/agent/project-instructions.ts`, committed copy only); the AGENT-13
  model entries and AGENT-11 chain (`src/agent/providers.ts`); the role gate
  (`resolveActingRole`, `src/plugins/roles.ts`); the delegate core and its worker env
  (`src/autonomous/delegate.ts`, `--skill` label today); SAFE-2 file-tool refusals
  (`plugins/files/protectedPaths.ts`).
- `delegate` and `council` are mutating, so only the owner's runs (or the local CLI) reach
  them; a lead run is therefore always the owner's.
- Out of scope: #232/#233, council voices (unchanged), AGENT-13.a headless CLI kind (its own
  slice; persona models are whatever entries the owner configured).

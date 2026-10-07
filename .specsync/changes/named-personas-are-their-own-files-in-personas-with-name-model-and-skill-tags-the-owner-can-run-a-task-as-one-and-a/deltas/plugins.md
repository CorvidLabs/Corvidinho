---
module: plugins
change: named-personas-are-their-own-files-in-personas-with-name-model-and-skill-tags-the-owner-can-run-a-task-as-one-and-a
---

# Delta: plugins (delegate --skill picks a persona; file tools leave personas/ alone — AUTONOMOUS-5.a, SAFE-2)

## Added

### REQUIREMENT REQ-plugins-225

AUTONOMOUS-5.a: after its tier clamp and before taking a worker slot, the
`delegate` handler (REQ-plugins-117) SHALL, for a `--skill`, load the named
personas (`loadPersonas`, Corvidinho's checkout; `DelegateCommandDeps.personaRoot`
is a test seam) and pick `personaForSkill` — the first persona by name whose
skill tags hold the skill exactly. With a pick whose model is not one the
owner configured (`personaModelRefusal` against the lead's env) it SHALL
refuse with exit 2 (`refused: Persona "…" … names model …`) and spawn
nothing; with a pick it SHALL run the worker as that persona (its model and
voice: `runDelegateChild({ persona })`, REQ-agent-225), add
`data.persona` (the name, else null) and label the result `[<skill> →
persona <name>]`; with no skill or no match the worker SHALL run as before
and an inherited `CORVIDINHO_DELEGATE_PERSONA` SHALL NOT reach it. Every
other delegate gate and limit is unchanged; `council` is unchanged.

SAFE-2 / AUTONOMOUS-2.a: `files-write`, `files-edit` and `files-delete` SHALL
refuse (exit 2, `refused (SAFE-2): … personas/ folder …`) any path whose
resolved target is in Corvidinho's own `personas/` folder
(`isLivePersonaPath`: inside `realpath(CORVIDINHO_ROOT)/personas`), before
any write or existence check; a project's own `personas/` directory SHALL
stay writable. Reads are unaffected.

Acceptance Criteria
- `delegate --skill review` with personas `zeta` and `alpha` both tagged `review` spawns the worker with `CORVIDINHO_DELEGATE_PERSONA=alpha` and returns `data.persona = "alpha"` (`tests/agent.personas.test.ts`).
- `--skill docs` (no match) and no skill spawn the worker with no `CORVIDINHO_DELEGATE_PERSONA`, even when the lead's env has one, and `data.persona` null.
- A match whose model is not configured is refused and no worker starts.
- With cwd at Corvidinho's checkout, `files-write` (relative and absolute), `files-edit` and `files-delete` of `personas/<file>` are refused with `refused (SAFE-2)` and nothing is written; `files-write personas/x.md` in another project succeeds.
- Fails on main's sources and passes on the branch.

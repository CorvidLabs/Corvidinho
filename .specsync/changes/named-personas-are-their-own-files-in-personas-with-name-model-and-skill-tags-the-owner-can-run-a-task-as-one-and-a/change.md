---
id: named-personas-are-their-own-files-in-personas-with-name-model-and-skill-tags-the-owner-can-run-a-task-as-one-and-a
state: implementing
type: feature
base_commit: 322750c9fad40a1d1b2113ab9b45dcc268a97980
---

# Named personas are their own files in personas/ with name, model and skill tags; the owner can run a task as one and a lead's delegate picks one by skill tag; team and community can't pick one (AUTONOMOUS-2.a, AUTONOMOUS-5.a)

## Intent

Named personas are their own files in personas/ with name, model and skill tags; the owner can run a task as one and a lead's delegate picks one by skill tag; team and community can't pick one (AUTONOMOUS-2.a, AUTONOMOUS-5.a)

## Affected Canonical Specs

- `agent`
- `cli`
- `discord`
- `plugins`

## Acceptance Criteria

- AUTONOMOUS-2.a and AUTONOMOUS-5.a (hi/autonomous.md, captured in this PR with hi from Leif's 2026-09-28 interview, round 17 on 2026-10-07) under AUTONOMOUS-2 and AUTONOMOUS-5; PERSONA-2 stays true. (1) Persona files: each named persona is its own file personas/<file>.md next to persona.md at Corvidinho's checkout root (CORVIDINHO_ROOT), with --- front matter name (short label), model (one AGENT-13 kind:model entry) and skills (tags), then its voice; loaded with the persona.md loader and rules (committed copy only in a git checkout, untracked refused as not committed, working-tree edits not loaded with one note, 8 KiB cap, symlinks out and binary refused, SAFE-6 scrubbed), read again every run, at most 32 files, a later file reusing a name refused; persona.md stays the default voice when no persona is picked (PERSONA-2). (2) Running as one: createTaskExecute({ persona: { name, by } }) puts the persona's voice in place of persona.md's (PERSONA-3 rules still after it) and its model at the head of the run tier's model chain with the tier's other configured models after it, so the SAFE-8 spend guard, the AGENT-11 fallback and notice and the AGENT-10 notice apply per model; a model that is not in CORVIDINHO_LLM_MODEL or a per-tier key, an unknown persona or a refused file fail the run with one plain line and no model call. (3) Who picks: the owner (or a local CLI run with no role session) via task run --persona NAME and the optional persona option of /session start (that run only); a team member or community user is refused with one line and nothing starts (bridge and task run both check); a lead's delegate --skill TAG runs its worker as the first persona by name whose skill tags hold TAG exactly (none = today's worker), passed only through CORVIDINHO_DELEGATE_PERSONA on the worker spawn (read only at depth > 0, never inherited); a matched persona whose model is not configured refuses the delegate call and spawns nothing; workers keep their tier, depth, community role and env limits; council voices are unchanged. (4) SAFE-2: files-write / files-edit / files-delete refuse any path in Corvidinho's own personas/ folder; a project's own personas/ directory is unaffected. Regression tests in tests/agent.personas.test.ts and tests/discord.session-persona.test.ts fail on main's sources and pass on the branch; docs (README, docs/discord.md, docs/DISCORD-GO-LIVE.md) and --help describe it.

## No-spec Rationale

Not applicable

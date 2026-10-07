---
change: named-personas-are-their-own-files-in-personas-with-name-model-and-skill-tags-the-owner-can-run-a-task-as-one-and-a
artifact: design
---

# Design

- **One module, `src/agent/personas.ts`.** Parse (`parsePersonaFile`), load
  (`loadPersonas`), look up (`findPersona`, `personaForSkill`), check the model
  (`configuredModelEntries`, `personaModelRefusal`), build the run env
  (`personaRunEnv`) and render (`renderNamedPersona`, sharing `personaBlock` with
  persona.md). Same root, cap and loader as persona.md.
- **Run as a persona = env overlay + voice swap.** `createTaskExecute({ persona })`
  resolves once, runs on `personaRunEnv` (tier key = persona model, then the tier's other
  configured models), and puts the persona block where persona.md's goes. The PERSONA-3
  rules stay after it. An unpriced persona model's spend ask names the persona file.
- **Who picks, checked where the run starts.** `by: "owner"` (CLI flag, slash option) is
  refused unless the acting role is the owner or there is no role session; `by: "lead"`
  only at depth > 0. The bridge refuses first (one ephemeral line, nothing started); the
  run re-checks. Refusal lines name persona, file and model label only.
- **Lead routing.** `delegate --skill` → `personaForSkill` (exact tag, first by name, none
  = today's worker) → model check against the lead's env (refuse, nothing spawned) →
  `CORVIDINHO_DELEGATE_PERSONA` on that worker's spawn only (deleted otherwise, read only
  at depth > 0). Workers keep tier / depth / community role / env limits. `council`
  unchanged. So the lead can pick by tag, `delegate`'s description ends with
  `personaSkillsHint` (each persona with tags and a configured model: `name (tag, …)`,
  labels only, 400-character cap), re-read at most every 5 s.
- **SAFE-2.** Beyond the committed-copy load, the file tools refuse any target inside
  `realpath(CORVIDINHO_ROOT)/personas` (Corvidinho's own folder only, never a project's
  `personas/`).
- No new config key, env var for the owner, table or schema change. The persona pick on
  `/session start` covers that run only.

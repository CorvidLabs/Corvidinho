---
change: persona-one-editable-persona-md-in-corvid-agent-s-voice-loaded-into-the-system-prompt-on-every-turn-and-every-surface
artifact: tasks
---

# Tasks

- [x] PERSONA-1..3 captured with `hi` (commit 303265d); `hi check` passes.
- [x] Regression tests fail on main: with origin/main's `src/agent/execute.ts`, `index.ts` and `project-instructions.ts` swapped in (new `persona.ts` and `persona.md` kept), `tests/agent.persona.test.ts` runs 8 pass / 10 fail; on main as is (no `persona.ts`) the file fails to load; restored, 18 pass / 0 fail.
- [x] `src/agent/persona.ts`: `loadPersona` over the AGENT-1 loader with `exactRoot`, `renderPersona` (header, `<persona>` block, close tag escaped), `personaWarning`, `withPersona`, `PERSONA_RULES_SYSTEM_INSTRUCTIONS`.
- [x] `src/agent/project-instructions.ts`: `exactRoot` option (no change to project instructions).
- [x] `src/agent/execute.ts`: load once per run from `CORVIDINHO_ROOT` (`personaRoot` test seam); persona first, rules after it on the tool loop and the read tier; one note per run for a missing, empty, refused, truncated or uncommitted file; finishing rule in the persona's voice, never a flat changelog.
- [x] `src/agent/index.ts` exports.
- [x] Shipped `persona.md` in corvid-agent's persona shape; no secrets.
- [x] README "Persona" section, docs/DISCORD-GO-LIVE.md E.8, agent.spec.md (files, Public API, Invariants, scenario, Error Cases), testing.md, delta (Added REQ-agent-069).
- [x] SpecSync check, audit and coverage, `hi check`, typecheck, full suite and the verify lane green.

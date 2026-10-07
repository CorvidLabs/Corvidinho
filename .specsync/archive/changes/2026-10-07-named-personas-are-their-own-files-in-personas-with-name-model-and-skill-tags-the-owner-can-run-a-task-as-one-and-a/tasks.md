---
change: named-personas-are-their-own-files-in-personas-with-name-model-and-skill-tags-the-owner-can-run-a-task-as-one-and-a
artifact: tasks
---

# Tasks

- [x] Capture AUTONOMOUS-2.a and AUTONOMOUS-5.a with `hi` (one commit); `hi check` passes.
- [x] `src/agent/personas.ts` (parse, load, find, skill pick, model check, run env, render) on the persona.md loader (`listInstructionDir`, `personaBlock`).
- [x] `createTaskExecute` `persona` option: env overlay, voice in place of persona.md, owner / lead gates, one-line refusals, spend ask label.
- [x] `task run --persona NAME` and a worker's lead pick from `CORVIDINHO_DELEGATE_PERSONA` (depth > 0 only).
- [x] `delegate --skill` picks a persona by exact tag (first by name), refuses an unconfigured model, sets the worker env only for a pick.
- [x] `/session start` optional `persona` (owner only, checked before anything starts) and `task run --persona` in the spawn argv.
- [x] SAFE-2: file tools refuse Corvidinho's own `personas/` folder.
- [x] Tests `tests/agent.personas.test.ts` (22) and `tests/discord.session-persona.test.ts` (5); fail-on-base proof recorded in testing.md.
- [x] Docs (README, docs/discord.md, docs/DISCORD-GO-LIVE.md, --help), spec prose, module testing evidence, deltas.
- [x] `specsync change approve`, `change check --commit`, `change audit`, `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.

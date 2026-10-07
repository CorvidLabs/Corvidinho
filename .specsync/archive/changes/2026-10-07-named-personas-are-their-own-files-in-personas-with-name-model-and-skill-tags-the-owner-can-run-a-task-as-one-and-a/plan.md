---
change: named-personas-are-their-own-files-in-personas-with-name-model-and-skill-tags-the-owner-can-run-a-task-as-one-and-a
artifact: plan
---

# Plan

1. `hi AUTONOMOUS-2.a …` / `hi AUTONOMOUS-5.a …` (one commit), `hi check`.
2. `listInstructionDir` in `src/agent/project-instructions.ts`; `personaBlock` in
   `src/agent/persona.ts`; new `src/agent/personas.ts`.
3. `createTaskExecute` `persona` option (env overlay, voice, gates, spend ask label).
4. `task run --persona` + worker pick from env (`src/cli.ts`); `DELEGATE_PERSONA_ENV`,
   `delegatePersonaFromEnv`, spawn env (`src/autonomous/delegate.ts`).
5. `delegate --skill` routing (`plugins/autonomous/commands.ts`); SAFE-2 live personas
   folder (`plugins/files/protectedPaths.ts`, `plugins/files/commands.ts`).
6. `/session start persona` (slash body, handler gate, spawn argv).
7. Tests (`tests/agent.personas.test.ts`, `tests/discord.session-persona.test.ts`),
   fail-on-base proof; docs (README, docs/discord.md, docs/DISCORD-GO-LIVE.md, --help);
   spec prose, testing evidence, deltas.
8. approve → `change check --commit` → audit → coverage → hi check → tsc → bun test →
   verify lane → draft PR.

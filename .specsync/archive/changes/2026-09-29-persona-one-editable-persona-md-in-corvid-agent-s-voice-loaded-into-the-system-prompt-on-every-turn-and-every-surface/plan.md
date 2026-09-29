---
change: persona-one-editable-persona-md-in-corvid-agent-s-voice-loaded-into-the-system-prompt-on-every-turn-and-every-surface
artifact: plan
---

# Plan

1. Capture PERSONA-1..3 with `hi` in their own commit; `hi check`.
2. Write `tests/agent.persona.test.ts` (loader units, `createTaskExecute`
   prompt order on both tiers, per-run reload, the shipped file, and end to
   end through each surface's spawn path against a 127.0.0.1 fake
   provider) and watch it fail with main's agent sources.
3. Add `src/agent/persona.ts` over the AGENT-1 loader (new `exactRoot`
   option in `src/agent/project-instructions.ts`), wire it into both system
   prompts in `src/agent/execute.ts`, export it from `src/agent/index.ts`.
4. Write the shipped `persona.md` in corvid-agent's persona shape.
5. Update README, docs/DISCORD-GO-LIVE.md (E.8), the agent spec prose,
   testing.md and the delta (Added REQ-agent-069).
6. `specsync change approve`, `specsync change check --commit`,
   `specsync change audit`, `specsync check --require-coverage 100`,
   `hi check`, `bunx tsc --noEmit`, `bun test`,
   `fledge lanes run verify --non-interactive`.

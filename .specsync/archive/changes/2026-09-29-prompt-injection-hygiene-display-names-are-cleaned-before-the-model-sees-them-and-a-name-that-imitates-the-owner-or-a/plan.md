---
change: prompt-injection-hygiene-display-names-are-cleaned-before-the-model-sees-them-and-a-name-that-imitates-the-owner-or-a
artifact: plan
---

# Plan

1. Confirm SAFE-11/12/13 are captured on main (`hi/safe.md`, #270); `hi check`.
2. Map every surface that puts third-party text or a display name into a
   prompt (research.md).
3. `src/agent/untrusted.ts`: name cleaning, look-alike skeleton, fence,
   detector, system-prompt paragraph, notice helpers; `web-fetch` fence on it.
4. `src/agent/execute.ts`: system prompts; tool-result fence + scan; mutating
   tools dropped and refused after a hit; audit; `onInjection`; summary note.
   `src/agent/types.ts` / `src/cli.ts`: `TaskResult.injection`.
5. Discord: `identity-inject.ts` (clean + `name_clash`), `injection-guard.ts`
   (speaker fence, refusal, owner notice, audit), bridge chat, `/session
   start`, `/work`, button-pick / slash / schedule owner notices, session
   thread and memory lines, spawn client.
6. WATCH: fenced title / body within the cap, verdict, refusal comment,
   audit, summary owner line, spawn client. `discord-user-lookup` names.
7. Tests (`tests/safe.injection.test.ts`), update the pending-ask test for
   fenced answers; prove fail on base with the base sources swapped in.
8. Docs (`docs/discord.md`, `docs/WATCH.md`, `docs/DISCORD-GO-LIVE.md`) and
   spec prose / `files:` / testing; deltas.
9. `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`,
   `bun test`, `fledge lanes run verify --non-interactive`.

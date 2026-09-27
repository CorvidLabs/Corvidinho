---
change: discord-6-rate-limits-and-mutes-discord-rate-limit-by-level-applies-to-chat-and-slash-via-the-actor-s-resolved
artifact: tasks
---

# Tasks

- [x] Re-verify defects 6, 8 and 11 on current main (3cdbb5c) with a throwaway `startBridge` fixture. All three reproduce, so none is dropped.
- [x] `routeMessage` resolves the actor's permission level for `rateLimitByLevel` when `RouterDeps.rateLimit.permLevel` is unset (`src/discord/message-router.ts`).
- [x] `handleSlashInteraction` resolves the actor's level (with `interaction.roleIds`) when `ctx.permLevelFor` is unset or returns undefined (`src/discord/slash-dispatch.ts`).
- [x] `/mute` refuses the invoker and the configured owner with ephemeral `MUTE_SELF_OR_OWNER_REFUSED` and leaves the mute set unchanged (`src/discord/command-handlers/mute.ts`).
- [x] `claimRefusalNotice` and `RateLimitState.refusalNoticeAt` (`src/discord/permissions.ts`). The router drops `reply` from a mute or rate refusal after the first notice in the window.
- [x] Regression tests in `tests/discord.rate-mute-limits.test.ts`: 9 fail on the old sources and all 11 pass after. The file is listed in `specs/discord/discord.spec.md` `files:`.
- [x] `docs/discord.md` DISCORD-6 subsection and the `/mute` row.
- [x] Modified delta for REQ-discord-010.
- [x] `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test` and `fledge lanes run verify --non-interactive`.

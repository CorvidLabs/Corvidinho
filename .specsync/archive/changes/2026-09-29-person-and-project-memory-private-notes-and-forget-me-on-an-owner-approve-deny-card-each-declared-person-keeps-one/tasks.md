---
change: person-and-project-memory-private-notes-and-forget-me-on-an-owner-approve-deny-card-each-declared-person-keeps-one
artifact: tasks
---

# Tasks

- [x] Capture MEMORY-5/6/7 (hi/memory.md) with `hi` and MEMORY-ACL-6 by hand from Leif's 2026-09-28 interview; `hi check` green.
- [x] Re-verify the gap on the stacked base 89f7976: Discord-id scope only, four categories, no project scope, no owner view, no private notes, no forget request, no card or DM.
- [x] `src/memory`: profile and private categories; `scope.ts` (subjects, person / project scopes, `projectKeyFor`); store recall over scopes without private notes, `countByCategory`, `purgeScopes`; `profile.ts`; `forget.ts`; schema v12 `forget_requests`.
- [x] `plugins/memory`: subject from the people list, `--person` owner-only, `--project` owner / team / local, private notes by name in a conversation, `memory-profile`, `memory-forget-me` (audited).
- [x] Discord: `memoryInjectOptsFor` + project block in chat, button pick and `/work`; `approve-card.ts`; `forget-card.ts`; gateway `sendDm`; bridge wiring (tick hook, after chat, card press before the channel gate, `deliverForgetCards`); scheduler `onTick`.
- [x] Prompt rules (e)–(h) in `MEMORY_AGENT_SYSTEM_INSTRUCTIONS`; identity rule names the acting person.
- [x] Tests: `tests/memory.profiles.test.ts` (16), `tests/discord.forget-card.test.ts` (9); `SCHEMA_VERSION` 12 in the two schema tests; fail on the base sources (the forget-card file does not load, 13 of 16 profile tests fail — three that also hold on base pass by design — and a base-exports-only behavioural copy fails 6 of 6), pass on the branch.
- [x] Review fix: a Discord id declared for two people (matches nobody, IDENTITY-7) is left out of every person's read scopes and forget targets (`linkedDiscordIds`); the new test fails without it.
- [x] Docs: `docs/discord.md`, `docs/DISCORD-GO-LIVE.md`, `docs/BOX-UPDATE.md`, `docs/WATCH.md`, `STATUS.md`; spec prose and `files:` (`discord`, `plugins`, `agent`), `specs/*/testing.md`; deltas Added REQ-discord-101 / REQ-plugins-101 / REQ-agent-101, Modified REQ-discord-021 / REQ-plugins-010.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.

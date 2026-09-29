---
change: person-and-project-memory-private-notes-and-forget-me-on-an-owner-approve-deny-card-each-declared-person-keeps-one
artifact: plan
---

# Plan

1. `specsync change new` on the #65 head (89f7976); capture MEMORY-5/6/7 with
   `hi` and MEMORY-ACL-6 by hand (one commit); `hi check`.
2. `src/memory`: profile + private categories; `scope.ts` (subjects,
   `person:` / `project:` scopes, `projectKeyFor`); store `recall` over
   several scopes without private notes, `countByCategory`, `purgeScopes`;
   `profile.ts`; `forget.ts` (`ForgetRequestStore`, targets, delete);
   schema v12 `forget_requests`.
3. `plugins/memory`: subject from the people list, `--person` (owner only),
   `--project` (owner / team / local), private notes by name in a
   conversation, `memory-profile`, `memory-forget-me` (audited).
4. Discord: `memoryInjectOptsFor` + project block (chat, button pick,
   `/work`); `approve-card.ts` (reusable Approve/Deny helper);
   `forget-card.ts` (delivery pass, press handling); gateway `sendDm`;
   bridge wiring (tick hook, after chat, card press before the channel gate);
   scheduler `onTick`.
5. Prompt rules (`MEMORY_AGENT_SYSTEM_INSTRUCTIONS`).
6. Tests: `tests/memory.profiles.test.ts`, `tests/discord.forget-card.test.ts`;
   schema-version tests to 12; prove fail on base.
7. Docs: `docs/discord.md`, `docs/DISCORD-GO-LIVE.md`, `docs/BOX-UPDATE.md`,
   `docs/WATCH.md`, `STATUS.md`; spec prose, `files:`, testing.
8. `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`,
   `bun test`, `fledge lanes run verify --non-interactive`.

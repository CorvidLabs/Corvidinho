---
change: discord-an-ask-button-press-passes-the-actor-gate-and-mute-rate-limit-like-chat-and-slash-so-a-muted-or-deny-listed
artifact: plan
---

# Plan

1. Regression test `tests/discord.ask-button-gates.test.ts` (fails on main).
2. Gateway: `interactionRoleIds`; `ComponentInteraction.roleIds` from
   `adaptComponent`; slash adapter reuses the helper.
3. Bridge `onComponent`: actor gate then mute/rate after the channel gate,
   ephemeral refusals, pending ask untouched.
4. Spec: files list, Public API, invariant; delta Modified REQ-discord-010 and
   REQ-discord-201. `docs/discord.md` gate order + ask section.
5. `specsync change check --commit`, `specsync check --require-coverage 100`,
   `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.

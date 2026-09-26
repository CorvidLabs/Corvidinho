---
change: discord-chat-and-slash-paths-gate-the-actor-against-the-user-role-allowlist-and-deny-lists-not-the-channel-alone
artifact: plan
---

# Plan

1. Regression test `tests/discord.actor-gate.test.ts` (fails on main).
2. Add `gateActor` to permissions.ts.
3. Gate the three `routeMessage` paths; add `RouterDeps.owner`; the bridge passes the owner.
4. Gate every slash command in the dispatcher.
5. Spec: files list, Public API, invariant; delta REQ-discord-201; docs note.
6. `specsync check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.

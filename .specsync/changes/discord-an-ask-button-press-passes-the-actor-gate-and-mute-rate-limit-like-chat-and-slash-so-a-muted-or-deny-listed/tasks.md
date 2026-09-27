---
change: discord-an-ask-button-press-passes-the-actor-gate-and-mute-rate-limit-like-chat-and-slash-so-a-muted-or-deny-listed
artifact: tasks
---

# Tasks

- [x] Repro on main: a muted or deny-listed session owner's button pick runs the agent.
- [x] Regression test `tests/discord.ask-button-gates.test.ts` that fails before the fix.
- [x] Gateway passes the presser's role ids (`interactionRoleIds`, `ComponentInteraction.roleIds`).
- [x] `onComponent`: channel → actor → mute/rate before open and pick; ephemeral refusals; ask kept.
- [x] Spec files list, Public API, invariant; delta Modified REQ-discord-010 / REQ-discord-201; docs.
- [x] Verify: specsync check, tsc, bun test, fledge verify lane.

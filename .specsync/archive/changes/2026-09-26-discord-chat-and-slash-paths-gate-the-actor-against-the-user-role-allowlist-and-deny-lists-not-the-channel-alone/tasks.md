---
change: discord-chat-and-slash-paths-gate-the-actor-against-the-user-role-allowlist-and-deny-lists-not-the-channel-alone
artifact: tasks
---

# Tasks

- [x] Regression test that fails before the fix.
- [x] `gateActor` in permissions.ts (deny roles + resolvePermissionLevel BLOCKED).
- [x] Actor gate on the mention, reply and thread paths in routeMessage; the bridge passes the owner.
- [x] Actor gate on every slash command (ephemeral zero-width ack).
- [x] Spec files list, Public API, invariant; delta; docs note.
- [x] Verify: specsync check, tsc, bun test, fledge verify lane.

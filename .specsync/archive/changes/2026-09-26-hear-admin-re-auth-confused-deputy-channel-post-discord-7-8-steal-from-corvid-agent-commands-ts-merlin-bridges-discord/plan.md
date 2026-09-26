---
change: hear-admin-re-auth-confused-deputy-channel-post-discord-7-8-steal-from-corvid-agent-commands-ts-merlin-bridges-discord
artifact: plan
---

# Plan

1. Add PermissionLevel + resolvePermissionLevel; extend allowlist/BridgeConfig
   with admin users/roles (empty = no ADMIN).
2. Refactor slash COMMAND_HANDLERS to CommandEntry `{ handler, minPermission? }`;
   re-check minPermission after channel + rate/mute gates.
3. Add `/mute` + `/unmute` ADMIN handlers (use existing muteUser/unmuteUser).
4. Add requester-perms module (evaluateRequesterCanSend + injectable checker);
   wire into discord-post-message with `--requesting-user-id` + strict env.
5. Fixture tests for admin re-auth and requester check (no live token).
6. SpecSync discord delta + companions; STATUS Done for #13; env/docs notes.
7. `fledge lanes run verify --non-interactive` then review/finalize/archive.

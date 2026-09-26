---
change: hear-admin-re-auth-confused-deputy-channel-post-discord-7-8-steal-from-corvid-agent-commands-ts-merlin-bridges-discord
artifact: design
---

# Design

## DISCORD-7

Steal shape from corvid-agent `COMMAND_HANDLERS` Map of
`{ handler, minPermission? }`. Dispatch order: channel allowlist → mute/rate →
`resolvePermissionLevel` → `minPermission` floor → handler.

Admin lists (`adminUsers` / `adminRoles`) are default-deny: empty ⇒ no ADMIN.
Mute/unmute are the thin admin-shaped surface (ancestor mute/unmute ADMIN).

## DISCORD-8

Steal Merlin `verifyRequesterCanSend` semantics (ViewChannel + SendMessages),
not archive advisory cross-channel-guard. Pure `evaluateRequesterCanSend(probe)`
for fixtures; injectable checker for plugin; live path uses discord.js
permissionsFor when a token is available. Channel allowlist remains first gate.
Strict mode opt-in via env (Merlin `require_requester_check` analogue).

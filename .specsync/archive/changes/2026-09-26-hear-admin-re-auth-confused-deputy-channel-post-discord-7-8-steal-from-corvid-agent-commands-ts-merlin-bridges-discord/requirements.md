---
change: hear-admin-re-auth-confused-deputy-channel-post-discord-7-8-steal-from-corvid-agent-commands-ts-merlin-bridges-discord
artifact: requirements
---

# Requirements

## DISCORD-7 — admin re-auth at run time

- Slash dispatch SHALL resolve the caller's permission level at run time and
  SHALL refuse before the handler when `permLevel < entry.minPermission`
  (ancestor `commands.ts` pattern). Discord UI registration alone is not
  sufficient (DISCORD-7).
- Admin-shaped commands `/mute` and `/unmute` SHALL declare
  `minPermission: ADMIN`. Empty admin user/role lists mean nobody is ADMIN
  (default-deny; not Merlin empty→BASIC).
- Permission resolution SHALL use admin user/role allowlists (env/file) plus
  muted → BLOCKED; deny user → BLOCKED. Non-admin slash (session/status/
  agents/work) keep existing channel + rate/mute gates.

## DISCORD-8 — confused-deputy channel post

- When `discord-post-message` is asked to post with a requesting user id, the
  bridge/plugin SHALL verify that requester has ViewChannel + SendMessages on
  the target channel — not only that the bot can post (DISCORD-8 / Merlin).
- Optional strict mode SHALL refuse posts missing `requesting_user_id`.
- Channel allowlist gate still runs first. Fixture tests SHALL cover pure
  evaluate + plugin wiring without a live Discord token.
- SHALL NOT use archive cross-channel-guard advisory as the ACL. SHALL NOT
  weaken allowlists or introduce ProcessManager. Secrets stay out of the repo.

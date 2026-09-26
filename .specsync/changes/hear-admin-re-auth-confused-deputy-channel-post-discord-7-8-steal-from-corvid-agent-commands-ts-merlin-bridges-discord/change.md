---
id: hear-admin-re-auth-confused-deputy-channel-post-discord-7-8-steal-from-corvid-agent-commands-ts-merlin-bridges-discord
state: implementing
type: feature
base_commit: 4fe4905f7108a76040cfda937e83bb0133857309
---

# HEAR admin re-auth + confused-deputy channel post (DISCORD-7,8) — steal from corvid-agent commands.ts + Merlin bridges/discord requester check; fixture tests; no ProcessManager; STATUS Done for #13

## Intent

HEAR admin re-auth + confused-deputy channel post (DISCORD-7,8) — steal from corvid-agent commands.ts + Merlin bridges/discord requester check; fixture tests; no ProcessManager; STATUS Done for #13

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- Slash dispatch re-checks resolvePermissionLevel + minPermission before admin-shaped handlers (mute/unmute ADMIN); non-admin refused even if Discord UI showed the command (DISCORD-7). discord-post-message verifies requesting user can ViewChannel+SendMessages on target channel when requesting_user_id provided; strict mode refuses missing requester id (DISCORD-8 / Merlin confused-deputy). Fixture tests no live token; default-deny allowlists unchanged; no ProcessManager; STATUS Done for #13 when merged

## No-spec Rationale

Not applicable

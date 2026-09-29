---
hi: 1
families: [ADMIN]
owner: leif
---

# Admin

## Intent

From Discord, an ADMIN can approve or add users, add or remove channels, and update safe config without SSHing the box — always re-checked at handler time. Empty admin or owner config stays deny-all.

## Criteria

- **ADMIN-1**  Slash admin commands let me approve and add users to the live allowlists Corvidinho already uses (file/env), without weakening empty=deny-all.
- **ADMIN-2**  Slash admin can add and remove channels from those allowlists (searchable STRING + autocomplete by name/id — not the limited native CHANNEL picker).
- **ADMIN-3**  Slash admin can show and update safe config knobs already represented in allowlist/env with an audit-friendly reply.
  - **ADMIN-3.c**  As owner I can change deny lists, mutes and the GitHub repo allow lists with /admin; every change is audited.
  - **ADMIN-3.a**  As owner I can add, change and remove declared people and their links with /admin; every change is audited.
  - **ADMIN-3.b**  As owner I can set each declared person's role with /admin; every change is audited.
- **ADMIN-4**  Every admin-shaped command re-checks permission at handler time (DISCORD-7); registration alone is never enough, and empty owner/admin lists mean nobody is ADMIN.

## Notes (not numbered AC)

- Memory forget/override (own or another user’s) requires ADMIN at handler time — see **MEMORY-ACL-3..4** in `hi/memory.md` (Leif amendment: self-forget is ADMIN too). Empty admin/owner = deny-all (**ADMIN-4**).
- Mutating tools for community chat vs owner ADMIN: **ROLES-CHAT-1..7** in [`hi/roles.md`](roles.md). ADMIN slash (#43) stays separate; capture gates first.

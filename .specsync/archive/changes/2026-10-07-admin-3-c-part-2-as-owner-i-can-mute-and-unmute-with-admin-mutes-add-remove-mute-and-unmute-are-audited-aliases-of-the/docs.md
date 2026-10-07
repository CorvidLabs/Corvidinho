---
change: admin-3-c-part-2-as-owner-i-can-mute-and-unmute-with-admin-mutes-add-remove-mute-and-unmute-are-audited-aliases-of-the
artifact: docs
---

# Docs

- `docs/discord.md`: slash table rows for `/admin mutes add|remove` and the
  `/mute` / `/unmute` alias notes; the runtime-admin knob table (mutes now
  updatable from `/admin`, in memory until restart, lasting block
  `/admin deny add user:`); the audit bullet (`admin-mutes-add|remove`, same
  rows for the aliases, no row for a no-op, owner/self refusal `denied`);
  the DISCORD-6 mutes bullet.
- `docs/DISCORD-GO-LIVE.md`: the owner can only be muted by the env seed
  (`/admin mutes add` and `/mute` refuse the owner); the ADMIN-3.c paragraph
  names `/admin mutes add|remove` and the in-memory / lasting-block note.
- README and STATUS stay true (no change).

---
change: admin-3-c-part-2-as-owner-i-can-mute-and-unmute-with-admin-mutes-add-remove-mute-and-unmute-are-audited-aliases-of-the
artifact: design
---

# Design

- One helper, `applyMuteChange(ctx, interaction, op, command)` in
  `command-handlers/admin.ts`, next to the SAFE-5 helpers it reuses
  (`auditEntry`, `auditSoft`, `ADMIN_AUDIT_SURFACE`). `/admin mutes
  add|remove` call it with `/admin mutes <op>`; `command-handlers/mute.ts`
  calls it with `/mute` / `/unmute`. mute.ts imports admin.ts (never the
  reverse), so there is no import cycle; `MUTE_SELF_OR_OWNER_REFUSED` moved
  to admin.ts and is re-exported unchanged.
- Order: missing user → usage (no row); a mute of the caller or the owner →
  `denied` + refusal; caller not ADMIN → `denied` (digest `["mutes", op]`,
  the `/admin` re-check's) + `not authorized`; no-op → "No change" (no row,
  like the list routes);
  SAFE-5 `started` (no trail or a throw ⇒ refused, set unchanged) → mutate
  the live set → `ok` (best effort) → reply with the row numbers.
- Aliases share the action names (`admin-mutes-add|remove`) and the args
  digest (`["mutes", op, target]`), so the trail does not tell `/mute` from
  `/admin mutes add`.
- ADMIN gating: the dispatcher floor for all three commands, the `/admin`
  handler's own re-check (with a `denied` row) for `/admin mutes`, and the
  helper's own re-check (ADMIN-4) so `/mute` / `/unmute` refuse at handler
  time the same way. The helper re-checks after the owner / caller refusal,
  so the existing REQ-discord-010 refusal ("any invoker's /mute of the owner,
  and a self-mute with no owner configured, are refused the same way") is
  unchanged, and before the no-op check, so a non-owner is never told whether
  someone is muted.
- In memory only (REQ-discord-010): no table, column, config key or env var.
  The mute reply says it lasts until restart and points to `/admin deny add
  user:`; an unmute of a `DISCORD_MUTED_USER_IDS` seed says the next restart
  mutes them again and that until then the tool layer (`src/plugins/roles.ts`
  reads that env, not the bridge's live set) still gives their runs community
  tools (the env list is parsed the way `src/discord/config.ts` parses it).

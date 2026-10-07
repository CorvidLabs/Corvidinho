---
change: admin-3-c-part-2-as-owner-i-can-mute-and-unmute-with-admin-mutes-add-remove-mute-and-unmute-are-audited-aliases-of-the
artifact: tasks
---

# Tasks

- [x] One audited mute helper (`applyMuteChange`) behind `/admin mutes add|remove` and the `/mute` / `/unmute` aliases: owner/caller refusal (`denied`), SAFE-5 `started` → `ok`, fail closed without a trail, no row for a no-op.
- [x] Reply says the mute is in memory until restart and points to `/admin deny add user:`; an unmute of a `DISCORD_MUTED_USER_IDS` seed says a restart mutes them again.
- [x] `/admin` routes `mutes add|remove` (non-owner `denied` row at the handler re-check); `config show` lists mutes among the updatable knobs.
- [x] Slash body: `/admin mutes` group with `add` / `remove` (required USER `user`).
- [x] `recordAudit` wired into the admin-reauth and owner test fixtures; `/admin` body test updated.
- [x] `tests/discord.admin-mutes.test.ts` (fails on the stacked base sources, passes on the branch).
- [x] Docs, spec prose, testing evidence and deltas (REQ-discord-010/011 modified).
- [x] `specsync change approve --actor corvid-agent`, `specsync change check --commit`, `specsync change audit`, `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.

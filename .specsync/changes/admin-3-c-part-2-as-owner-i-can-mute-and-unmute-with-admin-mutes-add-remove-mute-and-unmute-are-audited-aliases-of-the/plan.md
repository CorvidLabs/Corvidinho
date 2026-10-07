---
change: admin-3-c-part-2-as-owner-i-can-mute-and-unmute-with-admin-mutes-add-remove-mute-and-unmute-are-audited-aliases-of-the
artifact: plan
---

# Plan

1. `src/discord/command-handlers/admin.ts`: `applyMuteChange` (the one audited
   mute helper: target, owner/caller refusal, no-op check, SAFE-5 `started`
   fail closed, mutate, `ok`, reply), `MuteOp`, `MUTE_ACTIONS`, the
   `mutes add|remove` routes (with the non-owner `denied` row) and the
   `config show` mutes lines; `MUTE_SELF_OR_OWNER_REFUSED` moves here.
2. `src/discord/command-handlers/mute.ts`: `handleMuteCommand` /
   `handleUnmuteCommand` become aliases of `applyMuteChange`; re-export
   `MUTE_SELF_OR_OWNER_REFUSED` (no import cycle: mute.ts → admin.ts only).
3. `src/discord/slash-commands.ts`: the `/admin mutes` group (`add`,
   `remove`, required USER `user`); `/mute` / `/unmute` descriptions name
   the alias.
4. Tests: `tests/discord.admin-mutes.test.ts` (fails on the stacked base),
   `recordAudit` in the admin-reauth and owner fixtures, the `/admin` body
   test.
5. Docs (discord.md, DISCORD-GO-LIVE.md), spec prose, testing evidence and
   the REQ-discord-010/011 deltas.

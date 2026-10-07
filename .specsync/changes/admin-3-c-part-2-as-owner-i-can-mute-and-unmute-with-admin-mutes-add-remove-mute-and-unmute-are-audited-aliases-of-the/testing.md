---
change: admin-3-c-part-2-as-owner-i-can-mute-and-unmute-with-admin-mutes-add-remove-mute-and-unmute-are-audited-aliases-of-the
artifact: testing
---

# Testing

`tests/discord.admin-mutes.test.ts` (12 cases; in-memory SQLite audit, the
real `/admin` handler and slash dispatcher, a dry-run bridge with a fake
gateway; no token, no network): the `/admin mutes` body; owner add / remove
through the dispatcher with the live gate (`MUTED`), the reply text and the
`admin-mutes-*` `started` → `ok` rows; `/mute` / `/unmute` writing the same
actions, outcomes and args digest; owner and caller refusals (`denied`, set
unchanged); fail closed with a throwing trail and with no trail (add, remove,
both aliases); non-owner refused at dispatch and at the handler re-check
(`denied`); the `/mute` / `/unmute` handlers re-check ADMIN themselves
(`not authorized`, `denied` row with the `/admin` re-check's digest, no
mute state told; no owner ⇒ refused); no-op and usage write no row; the
`DISCORD_MUTED_USER_IDS` seed note (restart re-mutes; the tool layer still
gives community tools); `config show`; the bridge path (a muted member's @mention gets one
`MUTED` notice and no run, unmute serves again, rows in the bridge DB).

`tests/discord.admin-reauth.test.ts` and `tests/discord.owner.test.ts`
(updated): fixtures wire a `recordAudit` stub (the owner's `/mute` /
`/unmute` now fail closed without one). `tests/discord.admin-slash.test.ts`
(updated): the `/admin` body ends with the `mutes` group.

Fail-on-base: with origin/claude/m4-admin-lists-a2 8aa502a's
`src/discord/command-handlers/{admin,mute}.ts` and
`src/discord/slash-commands.ts` swapped in, all 12 cases of
`tests/discord.admin-mutes.test.ts` fail; restored, 12 of 12 pass. The
handler-time re-check case and the seed-note case also fail with the first
pushed head's (c0cae98) `admin.ts` swapped in.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-010` | `tests/discord.admin-mutes.test.ts` (11), `tests/discord.rate-mute-limits.test.ts` | `/admin mutes add|remove` change the live set the gates read (`MUTED` on `/status` and @mention, served after remove); SAFE-5 `admin-mutes-*` started → ok for every spelling with the same args digest; owner / caller refused `denied`; fail closed (throwing or missing trail); no row for a no-op; reply says until restart and names `/admin deny add user:`; seed note; `config show`; existing DISCORD-6 cases still pass. |
| `REQ-discord-011` | `tests/discord.admin-mutes.test.ts`, `tests/discord.admin-reauth.test.ts`, `tests/discord.owner.test.ts`, `tests/discord.admin-slash.test.ts` | non-owner `/admin mutes` refused at dispatch (no row) and at the handler re-check (`denied`); the `/mute` / `/unmute` handlers re-check ADMIN themselves (`denied`, same digest, no owner ⇒ refused); owner `/mute` / `/unmute` mutate the set with `recordAudit` wired; admin roles grant nothing (admin-reauth); `/admin` body has the `mutes` group. |
| all | full `bun test`, `fledge lanes run verify --non-interactive` | Run on this branch before push. |

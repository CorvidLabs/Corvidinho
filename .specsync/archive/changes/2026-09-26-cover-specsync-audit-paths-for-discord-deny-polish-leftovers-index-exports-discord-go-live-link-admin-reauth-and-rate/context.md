---
change: cover-specsync-audit-paths-for-discord-deny-polish-leftovers-index-exports-discord-go-live-link-admin-reauth-and-rate
artifact: context
---

# Context

PR #54 Discord deny polish archived its SDD change, but the tip also touches
four paths not declared on that change: `docs/DISCORD-GO-LIVE.md` (see-also
link), `src/discord/index.ts` (export ALLOWLIST_DENY_TIP / EPHEMERAL_SILENT_ACK),
`tests/discord.admin-reauth.test.ts` and `tests/discord.rate-mute.test.ts`
(deny-path asserts). `specsync change audit` fails until an active change covers
them. No new product behavior beyond audit coverage of already-landed DENY-1..3 work.

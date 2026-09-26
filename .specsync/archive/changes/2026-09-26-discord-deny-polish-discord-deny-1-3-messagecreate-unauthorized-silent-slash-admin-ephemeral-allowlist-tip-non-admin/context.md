---
change: discord-deny-polish-discord-deny-1-3-messagecreate-unauthorized-silent-slash-admin-ephemeral-allowlist-tip-non-admin
artifact: context
---

# Context

Leif confirmed Discord deny polish: outside allowlisted channels (or non-configured
users when a user allowlist applies), Corvidinho must not leak public "not
authorized" replies. Today `message-router.ts` returns `reply: NOT_AUTHORIZED` on
@mention in a non-allowlisted channel (bridge posts publicly), and slash-dispatch
always replies ephemeral "not authorized" even for non-admins.

Confirmed HI (2026-09-26): DISCORD-DENY-1..3 + amend DISCORD-5. Captured in
`hi/discord.md` commit before this SpecSync change. Mermaid stays in repo docs;
Discord chat uses embeds/fences/PNG.

Constraints: HI-first; do not invent extra deny cases; MessageCreate has no
ephemeral → silent for all on message deny; slash must ack within 3s → admin
ephemeral tip, non-admin ephemeral zero-width; Linux-only; SpecSync + fledge
verify green; no MEMORY/#35 nesting.

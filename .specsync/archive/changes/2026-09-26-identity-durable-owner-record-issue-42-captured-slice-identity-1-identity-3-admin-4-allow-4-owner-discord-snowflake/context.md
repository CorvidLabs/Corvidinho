---
change: identity-durable-owner-record-issue-42-captured-slice-identity-1-identity-3-admin-4-allow-4-owner-discord-snowflake
artifact: context
---

# Context

Issue #42 (M1 "Knows everyone", build step 1). Corvidinho has no durable owner
record: admin-shaped slash commands only know the DISCORD-7 env lists
`CORVIDINHO_DISCORD_ADMIN_USERS` / `_ROLES`, and nothing in config says who
Leif is. `hi/identity.md` captures **IDENTITY-1..3**; `hi/admin.md`
**ADMIN-4** (handler-time re-check, empty owner/admin = nobody ADMIN) and
`hi/allow.md` **ALLOW-4** (config on the bot VM: file and/or env) apply.

IDENTITY-2 ("only the configured owner may use admin slash commands") is
disputed in the #42 thread: Leif's role decision (#65) and the follow-up
"IDENTITY-2 stays" comment leave the reconciliation with the existing admin
env lists open. This change builds only what is valid under either reading:
a durable owner record that resolves to ADMIN. Making the owner the *only*
admin (and "empty owner means nobody is admin" even when the admin env lists
are set) is a breaking change for existing deployments and is left for Leif.

Out of scope (draft / not captured): owner memory notes, AlgoChat address and
wallets (#36), Approve/Deny DM cards (#96), stuck pings (#44), role tiers
(#65, draft IDENTITY-8..12), on-chain identity.

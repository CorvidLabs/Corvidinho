---
change: search-grep-files-glob-and-files-list-refuse-and-hide-secret-paths-for-non-admin-role-sessions-like-files-read-roles
artifact: context
---

# Context

End-to-end check of origin/main (6e5370d): with a fake key in `.env` and
`CORVIDINHO_ACTING_IS_ADMIN=0 CORVIDINHO_ACTING_DISCORD_USER_ID=5`,
`plugins run files-read .env` is refused (exit 2, ROLES-CHAT-8) but
`plugins run search-grep FAKEFAKE` returned
`.env:1:OPENAI_API_KEY=sk-proj-...` and `search-grep OPENAI_API_KEY .env`
returned the key line too. `plugins/search/commands.ts` never called
`isSecretPath`, and `search-grep` is in the non-ADMIN read catalog
(ROLES-CHAT-2), so any community chatter could have the agent print secrets
that `files-read` refuses. `files-glob` and `files-list` also listed
`.env`, `.ssh/id_rsa` and keystores, and `files-list .ssh` listed a key
directory.

HI: ROLES-CHAT-8 (hi/roles.md — non-ADMIN community sessions refuse secret
paths), SAFE-2 and SAFE-6 (hi/safe.md — protected env files / keystores;
secrets kept out of saved sessions). No new acceptance criteria: the fix
applies the existing `files-read` gate to the other read tools.

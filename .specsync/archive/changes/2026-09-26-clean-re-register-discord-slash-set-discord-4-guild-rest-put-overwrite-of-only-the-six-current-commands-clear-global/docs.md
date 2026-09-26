---
change: clean-re-register-discord-slash-set-discord-4-guild-rest-put-overwrite-of-only-the-six-current-commands-clear-global
artifact: docs
---

# Docs

- `docs/BOX-UPDATE.md`: set `DISCORD_GUILD_ID`, run
  `bun src/cli.ts discord register-commands` or restart bridge; if Discord UI
  still shows ghosts, leave/rejoin the server or wait (client cache); API list
  after PUT is source of truth.
- `STATUS.md`: note slash re-register fix + how to run register-commands.
- Help: document `discord register-commands` and prefer `DISCORD_GUILD_ID`.

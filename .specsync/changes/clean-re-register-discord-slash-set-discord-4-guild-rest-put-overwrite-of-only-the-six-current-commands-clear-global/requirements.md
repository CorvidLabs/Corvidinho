---
change: clean-re-register-discord-slash-set-discord-4-guild-rest-put-overwrite-of-only-the-six-current-commands-clear-global
artifact: requirements
---

# Requirements

1. REQ-discord-016: With guild id, registration SHALL PUT guild commands to exactly
   the six current bodies then PUT global commands to `[]` (full overwrite + clear).
2. Without guild id, registration MAY PUT globals to the six and SHALL warn that
   stale guild commands are not cleared; prefer DISCORD_GUILD_ID for dogfood.
3. SHALL NOT register the same names both global and guild in one path.
4. CLI `discord register-commands` SHALL perform the same overwrite (no invent names).
5. Fixture tests: mock put records guild-then-clear-globals order; no live token.
6. BOX-UPDATE/STATUS document how to re-register and Discord client cache tip.
7. No ProcessManager; secrets out of repo; allowlists unchanged.

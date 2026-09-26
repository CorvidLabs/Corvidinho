---
change: clean-re-register-discord-slash-set-discord-4-guild-rest-put-overwrite-of-only-the-six-current-commands-clear-global
artifact: research
---

# Research

- Ancestor: corvid-agent `server/discord/commands.ts` + `rest-client.putCommands`;
  Merlin `bridges/discord/src/commands.ts` `registerCommands`.
- Discord REST: PUT application guild commands overwrites that guild's full set;
  PUT application commands overwrites globals. Empty body clears that scope.
- Current gateway used `guild.commands.set` OR `application.commands.set` but
  never cleared the other scope → stale guild leftovers + fresh globals = dupes.
- Client UI can lag; API list after PUT is source of truth (leave/rejoin or wait).

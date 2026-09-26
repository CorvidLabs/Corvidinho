---
id: clean-re-register-discord-slash-set-discord-4-guild-rest-put-overwrite-of-only-the-six-current-commands-clear-global
state: archived
type: bug_fix
base_commit: 2cfad2f0919ce11a9b964c474ed90eab8025f008
---

# Clean re-register Discord slash set (DISCORD-4): guild REST PUT overwrite of only the six current commands, clear global applicationCommands to [], prefer DISCORD_GUILD_ID dogfood scope, CLI discord register-commands, fixture tests for putCommands guild-then-clear-globals; no new slash names

## Intent

Clean re-register Discord slash set (DISCORD-4): guild REST PUT overwrite of only the six current commands, clear global applicationCommands to [], prefer DISCORD_GUILD_ID dogfood scope, CLI discord register-commands, fixture tests for putCommands guild-then-clear-globals; no new slash names

## Affected Canonical Specs

- `discord`
- `cli`

## Acceptance Criteria

- With DISCORD_GUILD_ID set, startup and `corvidinho discord register-commands` REST PUT guild applicationGuildCommands to exactly the six bodies (session/status/agents/work/mute/unmute) then PUT applicationCommands to [] clearing globals; without guild id, PUT globals to the six and warn that stale guild commands are not cleared; fixture tests assert putCommands guild-then-clear-globals order without live token; BOX-UPDATE/STATUS document re-register + Discord client cache tip; no new slash names; fledge verify green

## No-spec Rationale

Not applicable

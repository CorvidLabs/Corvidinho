---
change: clean-re-register-discord-slash-set-discord-4-guild-rest-put-overwrite-of-only-the-six-current-commands-clear-global
artifact: context
---

# Context

Leif reported Discord slash commands look outdated/duplicated (e.g. two `/agents`).
Live Discord API showed: **global** has the six Corvidinho commands; **guild Corvid**
still has **11 stale corvid-agent** commands (`session` with new/list/resume/end,
`work` create/status/list/cancel, plus admin/config/message/credits/plugins).
Guild PUT never clears globals (and vice versa), so dual registration yields
duplicates in the Discord client.

Steal pattern (corvid-agent `putCommands` / Merlin `registerCommands`): guild
`Routes.applicationGuildCommands` PUT with ONLY the current six bodies, then
global `Routes.applicationCommands` PUT with `[]`. Prefer `DISCORD_GUILD_ID`
for dogfood speed. Do not invent new slash names. Stay off LLM/memory HI workstreams.

---
module: discord
change: clean-re-register-discord-slash-set-discord-4-guild-rest-put-overwrite-of-only-the-six-current-commands-clear-global
---

# Delta — discord (slash re-register overwrite)

## Modified

### REQUIREMENT REQ-discord-009

The bridge SHALL register and dispatch thin slash commands `/session`,
`/status`, `/agents`, `/work`, `/mute`, and `/unmute` so operators can manage
sessions, see agents, check status, and drive work tasks without leaving
Discord (DISCORD-4 / DISCORD-7). Handlers SHALL re-check the channel allowlist
at run time (DISCORD-5 / DISCORD-7 light). Session start and work SHALL use
SessionStore + in-memory work stubs + AgentClient. Registration SHALL use the
overwrite path in REQ-discord-016 (guild PUT of exactly these six, clear
globals when guild-scoped). The bridge SHALL NOT introduce ProcessManager,
invent additional slash commands, or weaken allowlists. Fixture tests SHALL
cover dispatch and handlers without a live Discord token.

Acceptance Criteria
- Command bodies include session (list/start), status, agents, work, mute, unmute (exactly these six).
- Non-allowlisted channel slash → not authorized; no session/work created.
- `/session list` reflects SessionStore; `/session start` creates stub + agent run.
- `/status` reports shared package version/uptime/sessions/work/channels/protocol plus dogfood lines (see REQ-discord-015).
- `/agents` lists local Corvidinho agent; `/work` creates work stub + agent run.
- No ProcessManager; secrets out of repo; default-deny allowlists unchanged.

## Added

### REQUIREMENT REQ-discord-016

Slash command registration SHALL full-overwrite the target scope with
`buildSlashCommandBodies()` (exactly the six DISCORD-4 commands) via Discord
REST PUT. When `DISCORD_GUILD_ID` (or equivalent guild id) is set, the system
SHALL PUT `Routes.applicationGuildCommands(appId, guildId)` with the six
bodies, then PUT `Routes.applicationCommands(appId)` with body `[]` to clear
stale globals (guild PUT never clears globals). The system SHALL NOT register
the same command names both global and guild in one registration path. When
guild id is unset, the system MAY PUT globals to the six bodies and SHALL warn
that stale guild commands are not cleared. Fixture tests SHALL cover
guild-then-clear-globals put order without a live Discord token. Steal
PUT+clear-globals only — do NOT port archive full `buildCommands()` lists.

Acceptance Criteria
- Guild id set → put order: guild bodies (len 6), then global `[]`.
- Guild id unset → global bodies (len 6); `clearedGlobals` false / warn.
- Bodies names exactly session, status, agents, work, mute, unmute.
- No dual global+guild registration of the same names in one path.
- No ProcessManager; secrets out of repo; no new slash names.

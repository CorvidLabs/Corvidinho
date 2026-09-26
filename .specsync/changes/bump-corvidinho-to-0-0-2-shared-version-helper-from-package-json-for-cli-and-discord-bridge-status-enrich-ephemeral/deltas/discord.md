---
module: discord
change: bump-corvidinho-to-0-0-2-shared-version-helper-from-package-json-for-cli-and-discord-bridge-status-enrich-ephemeral
---

# Delta — discord (enriched /status + shared version)

## Modified

### REQUIREMENT REQ-discord-009

The bridge SHALL register and dispatch thin slash commands `/session`,
`/status`, `/agents`, `/work`, `/mute`, and `/unmute` so operators can manage
sessions, see agents, check status, and drive work tasks without leaving
Discord (DISCORD-4 / DISCORD-7). Handlers SHALL re-check the channel allowlist
at run time (DISCORD-5 / DISCORD-7 light). Session start and work SHALL use
SessionStore + in-memory work stubs + AgentClient. The bridge SHALL NOT
introduce ProcessManager, invent additional slash commands, or weaken
allowlists. Fixture tests SHALL cover dispatch and handlers without a live
Discord token.

Acceptance Criteria
- Command bodies include session (list/start), status, agents, work, mute, unmute (exactly these six).
- Non-allowlisted channel slash → not authorized; no session/work created.
- `/session list` reflects SessionStore; `/session start` creates stub + agent run.
- `/status` reports shared package version/uptime/sessions/work/channels/protocol plus dogfood lines (see REQ-discord-015).
- `/agents` lists local Corvidinho agent; `/work` creates work stub + agent run.
- No ProcessManager; secrets out of repo; default-deny allowlists unchanged.

## Added

### REQUIREMENT REQ-discord-015

Ephemeral `/status` SHALL use the shared package version (no hardcoded bridge
constant) and SHALL include useful dogfood lines: Corvidinho vX.Y.Z; uptime;
protocol; channels count; sessions / work counts; LLM model + base host from
env when an API key is set (never print the key), else "demo stub"; the six
registered slash command names; optional git tip short SHA when available
without failing offline. Fixture tests SHALL cover formatting without a live
Discord token.

Acceptance Criteria
- Bridge starts with version from `src/version.ts` / package.json (no `BRIDGE_VERSION` literal).
- `/status` ephemeral body includes the fields above.
- With LLM key env set in fixtures → model @ host; without → demo stub; never the key.
- Offline / missing git → omit tip or show without throwing.
- Mute/unmute unchanged; no new slash commands.

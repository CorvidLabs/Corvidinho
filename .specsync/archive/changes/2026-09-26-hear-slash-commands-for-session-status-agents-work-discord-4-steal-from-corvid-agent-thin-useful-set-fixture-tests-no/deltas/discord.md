---
module: discord
change: hear-slash-commands-for-session-status-agents-work-discord-4-steal-from-corvid-agent-thin-useful-set-fixture-tests-no
---

# Delta — discord (DISCORD-4 slash commands)

## Added

### REQUIREMENT REQ-discord-009

The bridge SHALL register and dispatch thin slash commands `/session`,
`/status`, `/agents`, and `/work` so operators can manage sessions, see agents,
check status, and drive work tasks without leaving Discord (DISCORD-4). Handlers
SHALL re-check the channel allowlist at run time (DISCORD-5 / DISCORD-7 light).
Session start and work SHALL use SessionStore + in-memory work stubs +
AgentClient. The bridge SHALL NOT introduce ProcessManager or weaken allowlists.
Fixture tests SHALL cover dispatch and handlers without a live Discord token.

Acceptance Criteria
- Command bodies include session (list/start), status, agents, work.
- Non-allowlisted channel slash → not authorized; no session/work created.
- `/session list` reflects SessionStore; `/session start` creates stub + agent run.
- `/status` reports version/uptime/sessions/work/channels/protocol.
- `/agents` lists local Corvidinho agent; `/work` creates work stub + agent run.
- No ProcessManager; secrets out of repo; default-deny allowlists unchanged.

## Modified

### SPEC SECTION Purpose

Thin Discord HEAR bridge: gateway → message-router → session stub with live
thinking status and slash ops (DISCORD-1/2/2.a/3/4/5).

### SPEC SECTION Public API

loadBridgeConfig, startBridge, routeMessage, SessionStore, WorkStore,
goLiveChecklist, CORVIDINHO_PROTOCOL_VERSION, NOT_AUTHORIZED, agent/gateway
helpers, thinking-status builders/controller, slash command bodies + dispatch
(handleSlashInteraction, buildSlashCommandBodies); loadDiscordPlugins registers
discord-post-message.

### SPEC SECTION Invariants

Empty channel allowlist fail-start; empty user/role = deny-all when checked;
missing token clean exit; no ProcessManager; secrets out of repo;
discord-post-message dangerous; thinking status edits one progress message
in-place; slash handlers re-check channel allowlist before acting.

### SPEC SECTION Behavioral Examples

Mention→start_session; reply/thread→continue_session; slash /session|/status|
/agents|/work on allowlisted channel; non-allowlisted slash refused; missing
token / empty channels refuse cleanly; session run posts progress then Done.

### SPEC SECTION Error Cases

Missing token; empty channels; protocol mismatch; not authorized (message or
slash); SAFE-1 deny for discord-post; agent failure marks progress error then
reports; unknown slash command refused.

### SPEC SECTION Dependencies

src/allowlist/, agent task --no-verify, optional discord.js.

### SPEC SECTION Change Log

DISCORD-4 thin slash session/status/agents/work (2026-09-26, corvid-agent, #11).

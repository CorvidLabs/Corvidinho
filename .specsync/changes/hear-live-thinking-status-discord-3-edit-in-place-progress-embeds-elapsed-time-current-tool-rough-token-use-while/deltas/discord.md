---
module: discord
change: hear-live-thinking-status-discord-3-edit-in-place-progress-embeds-elapsed-time-current-tool-rough-token-use-while
---

# Delta — discord (DISCORD-3 thinking status)

## Added

### REQUIREMENT REQ-discord-008

While a session is running, the bridge SHALL show a live thinking status in the
channel (elapsed time, and when known: current tool and rough token use) by
posting one progress message and editing it in-place (DISCORD-3). The bridge
SHALL NOT leave a silent void for the duration of `agent.runChat`. Final agent
text SHALL still be posted as a separate reply after the progress message is
marked Done or error. The bridge SHALL NOT introduce ProcessManager.

Acceptance Criteria
- Session start/continue posts a progress embed (or equivalent) before awaiting agent completion.
- Progress edits include elapsed time; optional tool / token segments when provided.
- On success, progress marked Done then final reply posted; on failure, progress marked error.
- Fixture tests cover builders and edit sequence without live Discord token.
- Allowlists remain default-deny; no new secrets in repo.

## Modified

### SPEC SECTION Purpose

Thin Discord HEAR bridge: gateway → message-router → session stub with live
thinking status (DISCORD-1/2/2.a/3/5).

### SPEC SECTION Public API

loadBridgeConfig, startBridge, routeMessage, SessionStore, goLiveChecklist,
CORVIDINHO_PROTOCOL_VERSION, NOT_AUTHORIZED, agent/gateway helpers,
thinking-status builders/controller (formatElapsed, buildThinkingEmbed,
ThinkingStatus); loadDiscordPlugins registers discord-post-message.

### SPEC SECTION Invariants

Empty channel allowlist fail-start; empty user/role = deny-all when checked;
missing token clean exit; no ProcessManager; secrets out of repo;
discord-post-message dangerous; thinking status edits one progress message
in-place (no spam of new status messages each tick).

### SPEC SECTION Behavioral Examples

Mention→start_session; reply/thread→continue_session; missing token / empty
channels refuse cleanly; session run posts progress then edits elapsed/tool/
tokens then Done + final reply.

### SPEC SECTION Error Cases

Missing token; empty channels; protocol mismatch; not authorized;
SAFE-1 deny for discord-post; agent failure marks progress error then reports.

### SPEC SECTION Dependencies

src/allowlist/, agent task --no-verify, optional discord.js.

### SPEC SECTION Change Log

DISCORD-3 live thinking status (2026-09-26, corvid-agent, #10).

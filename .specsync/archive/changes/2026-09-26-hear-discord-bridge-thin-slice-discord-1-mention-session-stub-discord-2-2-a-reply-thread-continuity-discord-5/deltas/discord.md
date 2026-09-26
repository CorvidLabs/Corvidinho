---
module: discord
change: hear-discord-bridge-thin-slice-discord-1-mention-session-stub-discord-2-2-a-reply-thread-continuity-discord-5
---

# Delta — discord (HEAR thin)

## Modified

### SPEC SECTION Purpose

Thin Discord HEAR bridge: gateway → message-router → session stub (DISCORD-1/2/2.a/5).

### SPEC SECTION Public API

loadBridgeConfig, startBridge, routeMessage, SessionStore, goLiveChecklist, CORVIDINHO_PROTOCOL_VERSION, NOT_AUTHORIZED, agent/gateway helpers; loadDiscordPlugins registers discord-post-message.

### SPEC SECTION Invariants

Empty channel allowlist fail-start; empty user/role = deny-all when checked; missing token clean exit; no ProcessManager; secrets out of repo; discord-post-message dangerous.

### SPEC SECTION Behavioral Examples

Mention→start_session; reply/thread→continue_session; missing token / empty channels refuse cleanly.

### SPEC SECTION Error Cases

Missing token; empty channels; protocol mismatch; not authorized; SAFE-1 deny for discord-post.

### SPEC SECTION Dependencies

src/allowlist/, agent task --no-verify, optional discord.js.

### SPEC SECTION Change Log

HEAR thin DISCORD-1/2/2.a/5 (2026-09-26, corvid-agent, #5).

### REQUIREMENT REQ-discord-001

The system SHALL start a session stub with a stable session id when the bot is @mentioned in an allowlisted channel (DISCORD-1). The stub MAY spawn `corvidinho task run --no-verify` (or echo); it SHALL NOT port ProcessManager.

Acceptance Criteria
- `routeMessage` on mention in allowed channel returns `kind: "start_session"` with new session id.
- Session stub recorded in SessionStore; no ProcessManager.

### REQUIREMENT REQ-discord-002

The system SHALL continue the same session id when a user replies to a bot message (DISCORD-2). Inside a Discord thread the system SHALL keep one session id for that thread (DISCORD-2.a).

Acceptance Criteria
- Reply referencing a tracked bot message resumes that session id.
- Thread id map keeps one session per thread.

### REQUIREMENT REQ-discord-003

The system SHALL only listen and post in allowlisted channels; messages in other channels SHALL be refused quietly or with a short not-authorized reply (DISCORD-5). Checks SHALL use existing `src/allowlist/` Discord helpers where empty channel/user/role lists mean deny-all.

Acceptance Criteria
- Non-allowlisted channel → `kind: "refuse"` / not authorized; no session created.
- `loadBridgeConfig` errors when channels list empty.

### REQUIREMENT REQ-discord-004

The bridge SHALL load allowlists from file and env. It SHALL require a non-empty channel allowlist and SHALL fail to start if the channel list is empty.

Acceptance Criteria
- DISCORD_CHANNEL_IDS and/or file/env channels union; empty → empty_channels error.

### REQUIREMENT REQ-discord-005

When DISCORD_TOKEN and DISCORD_BOT_TOKEN are both missing, the CLI/doctor/bridge SHALL explain the requirement and exit cleanly without crashing. Secrets SHALL never be committed to the repo.

Acceptance Criteria
- `corvidinho discord bridge` without token exits non-zero naming DISCORD_TOKEN / DISCORD_BOT_TOKEN and go-live checklist.

### REQUIREMENT REQ-discord-006

The bridge SHALL check wire protocol version against `corvidinho --protocol-version` (DISCORD-10 light): hard-fail on a verifiable mismatch; soft-continue if unverifiable.

Acceptance Criteria
- `corvidinho --protocol-version` prints `1`.
- Verifiable mismatch refuses start.

### REQUIREMENT REQ-discord-007

The system SHALL register `discord-post-message` as a dangerous plugin (externally visible write). Non-interactive runs SHALL deny it unless allowlisted (SAFE-1).

Acceptance Criteria
- `plugins list` shows dangerous=true.
- Non-interactive without allowlist → exit 2.

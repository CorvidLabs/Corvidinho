---
change: hear-discord-bridge-thin-slice-discord-1-mention-session-stub-discord-2-2-a-reply-thread-continuity-discord-5
artifact: requirements
---

# Requirements

### REQ-discord-001
The system SHALL start a session stub with a stable session id when the bot is @mentioned in an allowlisted channel (DISCORD-1). The stub MAY spawn `corvidinho task run --no-verify` (or echo); it SHALL NOT port ProcessManager.

### REQ-discord-002
The system SHALL continue the same session id when a user replies to a bot message (DISCORD-2). Inside a Discord thread the system SHALL keep one session id for that thread (DISCORD-2.a).

### REQ-discord-003
The system SHALL only listen and post in allowlisted channels; messages in other channels SHALL be refused quietly or with a short not-authorized reply (DISCORD-5). Checks SHALL use existing `src/allowlist/` Discord helpers where empty channel/user/role lists mean deny-all.

### REQ-discord-004
The bridge SHALL load allowlists from file and env. It SHALL require a non-empty channel allowlist (from DISCORD_CHANNEL_IDS and/or CORVIDINHO_DISCORD_ALLOW_CHANNELS / allowlist file) and SHALL fail to start if the channel list is empty. Optional role/user lists SHALL deny-all when empty and those gates apply.

### REQ-discord-005
When DISCORD_TOKEN and DISCORD_BOT_TOKEN are both missing, the CLI/doctor/bridge SHALL explain the requirement and exit cleanly without crashing. Secrets SHALL never be committed to the repo.

### REQ-discord-006
The bridge SHALL check wire protocol version against `corvidinho --protocol-version` (DISCORD-10 light): hard-fail on a verifiable mismatch; soft-continue if unverifiable.

### REQ-discord-007
The system SHALL register `discord-post-message` as a dangerous plugin (externally visible write). Non-interactive runs SHALL deny it unless allowlisted (SAFE-1).

### REQ-cli-008
The CLI SHALL expose `discord bridge` to start the HEAR bridge and `--protocol-version` printing the wire protocol integer. Doctor SHALL note Discord token and allowlist go-live requirements without printing secret values.

### REQ-docs-001
STATUS and README SHALL document what Leif must set for go-live: Discord token plus non-empty Discord allowlists.

---
change: discord-post-message-checks-the-acting-discord-user-the-bridge-set-not-only-a-model-supplied-id-discord-8
artifact: requirements
---

# Requirements

- DISCORD-8 (captured in `hi/discord.md`) is the only acceptance source.
- Modify REQ-discord-012 (delta `deltas/discord.md`): in a bridge-started run
  (non-empty `CORVIDINHO_ACTING_DISCORD_USER_ID`) the requester check always
  runs for the acting user; a `--requesting-user-id` / `--requester` naming a
  different user is refused with nothing posted; a check that cannot run
  refuses (fail closed) with one scrubbed reason line; the channel allowlist
  deny still wins first; with the acting env empty or unset behaviour is
  unchanged.
- No new REQ id, env var, flag, config key, command or schema version.

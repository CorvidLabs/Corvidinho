---
change: box-updater-pidfile-mode-counts-the-bridge-ready-only-on-its-discord-login-line-discord-logged-in-as-not-the-pre-login
artifact: requirements
---

# Requirements

Modified `REQ-cli-347` (deltas/cli.md): in pidfile mode the updater SHALL count the bridge ready
only on the login line the gateway prints on ClientReady, and SHALL roll back when the bridge exits
or does not log in within `CORVIDINHO_READY_TIMEOUT`; systemd mode keeps `systemctl is-active`.
Existing REQ-cli-347 text and acceptance bullets are kept in full.

Serves DISCORD-ANNOUNCE-4 (hi/discord.md: announce after every *successful* bridge restart / version
bump — an update must not report success for a bridge that never logged in) and DISCORD-12
(hi/discord.md: the live build shows its version as presence, which the bridge sets in the same
ClientReady handler that prints the login line), plus the `docs/BOX-UPDATE.md` updater contract.
Bug fix to a shipped script; no new command, env var or product surface.

---
id: box-updater-pidfile-mode-counts-the-bridge-ready-only-on-its-discord-login-line-discord-logged-in-as-not-the-pre-login
state: archived
type: bug_fix
base_commit: 0e6e8d26b983a31b5518bc7013f75d5513fd94ba
---

# Box updater pidfile mode counts the bridge ready only on its Discord login line ([discord] logged in as), not the pre-login protocol version OK line, so a bridge that dies on login rolls back

## Intent

Box updater pidfile mode counts the bridge ready only on its Discord login line ([discord] logged in as), not the pre-login protocol version OK line, so a bridge that dies on login rolls back

## Affected Canonical Specs

- `cli`

## Acceptance Criteria

- In pidfile mode the updater counts the bridge ready only when the bridge log shows the line the gateway prints on ClientReady ([discord] logged in as <tag>); the pre-login [discord] protocol version N OK line alone is not ready. A bridge that prints protocol OK and then exits (for example DiscordAPIError on login) makes the update roll back and exit 1; a bridge that never logs in within CORVIDINHO_READY_TIMEOUT rolls back with a timeout log line; a bridge that prints the login line passes with exit 0 and no rollback. systemd mode still checks systemctl is-active. docs/BOX-UPDATE.md and docs/UPDATE.md name the login line as the ready signal.

## No-spec Rationale

Not applicable

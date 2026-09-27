---
change: box-updater-pidfile-mode-counts-the-bridge-ready-only-on-its-discord-login-line-discord-logged-in-as-not-the-pre-login
artifact: docs
---

# Docs

- `docs/BOX-UPDATE.md`: pidfile mode waits for `[discord] logged in as <bot tag>` (printed only after
  Discord login); `protocol version N OK` is printed before login and does not count; a bridge that
  exits or does not log in within `CORVIDINHO_READY_TIMEOUT` makes the update roll back (exit 1, log
  lines only). The systemd bullet says it checks `systemctl is-active` and does not read the log. The
  env table row for `CORVIDINHO_READY_TIMEOUT` names the login line; step 7 lists a bridge that is
  not ready as a rollback cause.
- `docs/UPDATE.md`: the pidfile summary names the login line and drops the protocol line as a
  success signal.
- `scripts/corvidinho-update.sh` header comment for `CORVIDINHO_READY_TIMEOUT` matches.

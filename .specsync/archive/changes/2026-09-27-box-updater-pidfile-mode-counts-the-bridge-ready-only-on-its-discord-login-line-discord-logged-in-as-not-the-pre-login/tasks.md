---
change: box-updater-pidfile-mode-counts-the-bridge-ready-only-on-its-discord-login-line-discord-logged-in-as-not-the-pre-login
artifact: tasks
---

# Tasks

- [x] Re-verify D5 on origin/main 0e6e8d2: helper accepts `protocol version N OK`; fake bridge printing it then exiting 1 gives exit 0, no rollback.
- [x] Check what the bridge already prints after login: `[discord] logged in as <tag>` in the ClientReady handler (no bridge change needed).
- [x] Regression tests in tests/update-helpers.test.ts (helper + fake box with fake bun/systemctl) that fail on main.
- [x] `log_indicates_ready` accepts only the login line (`BRIDGE_READY_LINE`), no pipe under pipefail.
- [x] `wait_for_ready` log lines name the awaited line and the timeout; timeout + rollback unchanged; systemd mode keeps is-active.
- [x] docs/BOX-UPDATE.md, docs/UPDATE.md and the script header describe the login-line ready gate.

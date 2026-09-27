---
change: box-updater-pidfile-mode-counts-the-bridge-ready-only-on-its-discord-login-line-discord-logged-in-as-not-the-pre-login
artifact: design
---

# Design

- `scripts/lib/update-helpers.sh`: new `BRIDGE_READY_LINE='[discord] logged in as'`, the exact
  prefix the gateway prints on ClientReady. `log_indicates_ready` returns 0 only when the log holds
  that prefix followed by a space (a bot tag follows). The `protocol version N OK` branch is removed.
  The match is a bash substring test instead of `printf | grep -q`, so the updater's
  `set -o pipefail` cannot turn an early-exiting `grep -q` on a long log into a false "not ready".
- `scripts/corvidinho-update.sh`: `wait_for_ready` is unchanged apart from its log lines, which now
  name the awaited line and the timeout. The existing paths stay: pid gone → "bridge exited before
  ready" → rollback; no login line by the deadline → "ready timeout" → rollback (exit 1, no Discord
  post). Unit mode still restarts and checks `systemctl is-active`.
- Contract between the two files is pinned by a test that finds the login line inside the
  `Events.ClientReady` handler in `src/discord/gateway.ts` and feeds it to the helper.
- Where PID 1 does not reap orphans (some containers), an exited bridge stays a zombie and
  `kill -0` still succeeds, so the exit is caught by the timeout rather than at once; the
  outcome (rollback, exit 1) is the same. Not changed here.

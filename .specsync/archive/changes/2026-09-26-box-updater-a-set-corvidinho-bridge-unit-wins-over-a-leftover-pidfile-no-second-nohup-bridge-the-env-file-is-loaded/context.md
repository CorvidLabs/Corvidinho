---
change: box-updater-a-set-corvidinho-bridge-unit-wins-over-a-leftover-pidfile-no-second-nohup-bridge-the-env-file-is-loaded
artifact: context
---

# Context

A crash/restart-recovery audit of `origin/main` confirmed three bugs in the shipped box updater
`scripts/corvidinho-update.sh` (operator contract: `docs/BOX-UPDATE.md`):

1. `want_pidfile()` checked for an existing pidfile before `CORVIDINHO_BRIDGE_UNIT`. On a box with a
   systemd bridge unit, a leftover `/tmp/corvidinho-discord-bridge.pid` made the updater skip
   `systemctl` and `nohup`-start a second bridge next to the unit's (every mention handled twice);
   because it rewrote the pidfile, every later update stayed in pidfile mode.
2. `CORVIDINHO_ENV_FILE` was sourced only inside the pidfile start. `doctor` ran with whatever env the
   shell had (a cron/non-login run with secrets only in the env file failed doctor and rolled back
   every time), and unit/command restarts, including rollback restarts, never saw the file.
3. The documented `CORVIDINHO_BRIDGE_CMD` example (`pkill -f 'discord bridge' || true; nohup …`) ran as
   `bash -lc "$BRIDGE_CMD"`, so the pattern was on the shell's own argv: `pkill` killed that shell
   (exit 143, reproduced), the new bridge never started and the update rolled back with the bridge down.

Fix scope is the script, its tests and `docs/BOX-UPDATE.md`. Explicit `CORVIDINHO_USE_PIDFILE=1` still
forces pidfile mode; with no unit a leftover pidfile still selects pidfile mode. Rollback still does not
re-run `CORVIDINHO_BRIDGE_CMD` (unchanged; out of scope). The env file is loaded after `bun install` so
secrets stay out of fetch/install.

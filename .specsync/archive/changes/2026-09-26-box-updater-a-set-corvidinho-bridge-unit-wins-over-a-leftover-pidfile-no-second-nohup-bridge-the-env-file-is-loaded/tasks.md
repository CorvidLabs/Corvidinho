---
change: box-updater-a-set-corvidinho-bridge-unit-wins-over-a-leftover-pidfile-no-second-nohup-bridge-the-env-file-is-loaded
artifact: tasks
---

# Tasks

- [x] Re-verify the three bugs on origin/main (read code; pkill self-match reproduced, exit 143).
- [x] Regression tests with a fake box (local origin, fake bun/systemctl on PATH) that fail on main.
- [x] want_pidfile: an explicit unit wins over a leftover pidfile; drop a stale pidfile in unit mode, never signal a live pid.
- [x] Load CORVIDINHO_ENV_FILE once (idempotent) after bun install, before doctor, and in rollback before its restart.
- [x] Run CORVIDINHO_BRIDGE_CMD with its text via env so pkill -f cannot match its own shell.
- [x] docs/BOX-UPDATE.md: env timing, mode order, anchored pkill examples.

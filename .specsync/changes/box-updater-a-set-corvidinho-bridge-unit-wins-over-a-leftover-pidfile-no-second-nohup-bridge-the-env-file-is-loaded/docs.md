---
change: box-updater-a-set-corvidinho-bridge-unit-wins-over-a-leftover-pidfile-no-second-nohup-bridge-the-env-file-is-loaded
artifact: docs
---

# Docs

`docs/BOX-UPDATE.md`: env-file timing (sourced once after `bun install`, before doctor, for doctor, every
restart path and rollback); restart-mode order (a set unit wins over a leftover pidfile; stale pidfile
removed, live pid left alone); command mode passes the text via env; both `pkill -f` examples use the
anchored pattern `'^[^ ]*bun [^ ]*cli\.ts discord bridge'`. Script header comments match.

---
change: enhance-corvidinho-update-sh-with-pidfile-tmp-corvidinho-discord-bridge-pid-stop-start-and-wait-for-logged-in-or
artifact: design
---

# Design

Restart preference: pidfile path when present or `CORVIDINHO_USE_PIDFILE=1`; else existing UNIT/BRIDGE_CMD. Ready match via helpers. Env file `CORVIDINHO_ENV_FILE` sourced before start. Rollback restores SHA and restarts the same way. Release job: `gh release view` → skip create if exists.

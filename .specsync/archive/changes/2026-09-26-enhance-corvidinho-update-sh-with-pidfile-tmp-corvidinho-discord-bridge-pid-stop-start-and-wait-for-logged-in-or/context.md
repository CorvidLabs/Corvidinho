---
change: enhance-corvidinho-update-sh-with-pidfile-tmp-corvidinho-discord-bridge-pid-stop-start-and-wait-for-logged-in-or
artifact: context
---

# Context

#45 shipped tag→Release + updater + `docs/BOX-UPDATE.md` but omitted the task’s pidfile stop/start (`/tmp/corvidinho-discord-bridge.pid`), ready-log wait (`[discord] logged in` / protocol OK), explicit release idempotency, `docs/UPDATE.md`, helper tests, and 0.0.3 bump for user-visible update docs.

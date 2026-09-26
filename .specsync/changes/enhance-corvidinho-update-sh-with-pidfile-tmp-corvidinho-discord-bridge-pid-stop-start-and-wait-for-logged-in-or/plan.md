---
change: enhance-corvidinho-update-sh-with-pidfile-tmp-corvidinho-discord-bridge-pid-stop-start-and-wait-for-logged-in-or
artifact: plan
---

# Plan

1. Extract testable helpers; enhance `scripts/corvidinho-update.sh` with pidfile + ready wait (retain systemd/BRIDGE_CMD).
2. Idempotent check in `release.yml`; add `docs/UPDATE.md`; CHANGELOG + bump 0.0.3 + STATUS.
3. Bun tests for helpers; SpecSync ship; tag v0.0.3.

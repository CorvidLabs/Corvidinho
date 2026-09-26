---
change: tag-push-v-creates-idempotent-verbose-github-release-scripts-corvidinho-update-sh-safe-box-update-with-sha-record
artifact: context
---

# Context

v0.0.2 release notes explicitly deferred **Tag→Release Action** and a **crash-safe updater script**. Bot box updates today are manual `git fetch` + restart; a bad tip can strand the Discord bridge with no automatic rollback, and tag pushes do not create GitHub Releases.

Constraints:
- Secrets stay in VM env / EnvironmentFile — never hardcode in scripts or workflows.
- Update failures must **log only** — never post panic / status spam to Discord.
- Bridge stop uses pidfile `/tmp/corvidinho-discord-bridge.pid` (documented contract).
- Ready signals already logged by the bridge: `[discord] logged in` and `protocol version … OK`.

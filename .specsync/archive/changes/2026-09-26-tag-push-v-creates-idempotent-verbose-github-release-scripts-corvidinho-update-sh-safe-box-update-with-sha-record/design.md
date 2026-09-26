---
change: tag-push-v-creates-idempotent-verbose-github-release-scripts-corvidinho-update-sh-safe-box-update-with-sha-record
artifact: design
---

# Design

- **Release Action:** GitHub-hosted `ubuntu-latest`; `contents: write`; softprops v2 with `generate_release_notes: true` and optional CHANGELOG excerpt; pre-check `gh release view` for idempotency (exit 0 if exists).
- **Update script:** bash, `set -euo pipefail`; repo root via `CORVIDINHO_ROOT` (default script parent); target ref via `CORVIDINHO_REF` (default `main`); env file via `CORVIDINHO_ENV_FILE` (default `~/.config/corvidinho/env` — sourced if present, never committed); log to `CORVIDINHO_BRIDGE_LOG` (default `/tmp/corvidinho-discord-bridge.log`); pidfile fixed at `/tmp/corvidinho-discord-bridge.pid`.
- **Ready match:** substring `[discord] logged in` OR `protocol version` + `OK` in recent log lines.
- **Rollback:** on ready timeout or start failure, `git checkout <previous_sha>`, reinstall, restart; always log — never Discord REST.
- **No ProcessManager** — thin ops only.

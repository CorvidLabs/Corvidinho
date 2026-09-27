# Updating Corvidinho

Ship cuts are **GitHub Releases** on tags `v*` — see [Releases](https://github.com/CorvidLabs/Corvidinho/releases). Tag pushes run `.github/workflows/release.yml` (idempotent if the release already exists). Not every package version is tagged (for example 0.0.12, 0.0.13, 0.0.16, 0.0.18 and 0.0.21 were not); an untagged version has no Release and its code ships in the next tag.

## Prefer the safe updater

```bash
cd /path/to/Corvidinho
CORVIDINHO_REF=vX.Y.Z ./scripts/corvidinho-update.sh   # a pushed tag: git ls-remote --tags origin
```

Full operator notes (systemd / `BRIDGE_CMD`, dry-run, doctor): **[`docs/BOX-UPDATE.md`](BOX-UPDATE.md)**.

### Pidfile + ready wait (default when no systemd unit)

- Stop/start via `/tmp/corvidinho-discord-bridge.pid`
- Log: `/tmp/corvidinho-discord-bridge.log`
- Success requires `[discord] logged in` or `protocol version … OK` within `CORVIDINHO_READY_TIMEOUT` (default 60s)
- On failure: rollback to previous SHA + restart — **log only** (never Discord panic posts)
- Secrets: source `~/.config/corvidinho/env` (`CORVIDINHO_ENV_FILE`) — never hardcode; see `.env.example`
- `corvidinho doctor` must pass after install or the update rolls back — including the `allowlist-file` check: an allowlist file the loader cannot parse fails it (and would stop the bridge, `github watch` and `daemon` from starting)
- The updater restarts **only the bridge**. Restart `github watch` and `corvidinho daemon` yourself (protocol lockstep, [`DISCORD-GO-LIVE.md`](DISCORD-GO-LIVE.md) E.2)

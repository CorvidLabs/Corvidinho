# Updating Corvidinho

Ship cuts are **GitHub Releases** on tags `v*` — see [Releases](https://github.com/CorvidLabs/Corvidinho/releases). Tag pushes run `.github/workflows/release.yml` (idempotent if the release already exists).

## Prefer the safe updater

```bash
cd /path/to/Corvidinho
CORVIDINHO_REF=v0.0.3 ./scripts/corvidinho-update.sh
```

Full operator notes (systemd / `BRIDGE_CMD`, dry-run, doctor): **[`docs/BOX-UPDATE.md`](BOX-UPDATE.md)**.

### Pidfile + ready wait (default when no systemd unit)

- Stop/start via `/tmp/corvidinho-discord-bridge.pid`
- Log: `/tmp/corvidinho-discord-bridge.log`
- Success requires the bridge's Discord login line `[discord] logged in as …` within `CORVIDINHO_READY_TIMEOUT` (default 60s); the earlier `protocol version … OK` line is printed before login and does not count
- On failure: rollback to previous SHA + restart — **log only** (never Discord panic posts)
- Secrets: source `~/.config/corvidinho/env` (`CORVIDINHO_ENV_FILE`) — never hardcode; see `.env.example`
